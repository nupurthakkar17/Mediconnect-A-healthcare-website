const express = require('express');
const router = express.Router();

// Reuse the shared pooled connection instead of opening a new one with a
// hardcoded password.
const db = require('../db');

const STATUS_LABELS = {
  placed: 'Order placed',
  confirmed: 'Confirmed by pharmacy',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
};
const STATUS_ORDER = ['placed', 'confirmed', 'out_for_delivery', 'delivered'];

// ---------- Middleware to Initialize Cart ----------
function initializeCart(req, res, next) {
  if (!req.session.cart) req.session.cart = [];
  next();
}

// ---------- Route: Display All Medicines ----------
router.get('/', initializeCart, (req, res) => {
  db.query('SELECT * FROM medicines ORDER BY name', (err, results) => {
    if (err) {
      console.error('Error fetching medicines:', err);
      return res.status(500).render('medicinedelivery/index', { products: [], error: 'Could not load medicines right now.', cartCount: 0 });
    }
    const cartCount = req.session.cart.reduce((n, i) => n + i.quantity, 0);
    res.render('medicinedelivery/index', { products: results, error: null, cartCount });
  });
});

// ---------- Route: Display Cart ----------
router.get('/cart', initializeCart, (req, res) => {
  const total = req.session.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  res.render('medicinedelivery/cart', { cart: req.session.cart, total, error: null });
});

// ---------- Route: Add Items to Cart ----------
router.post('/cart', initializeCart, (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required.' });
  }

  db.query('SELECT * FROM medicines WHERE id = ?', [productId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Error adding product to cart.' });
    if (results.length === 0) return res.status(404).json({ error: 'Medicine not found.' });

    const product = results[0];
    const cart = req.session.cart;
    const existingItem = cart.find((item) => item.id === product.id);
    const currentQty = existingItem ? existingItem.quantity : 0;

    if (currentQty + 1 > product.stock) {
      return res.status(409).json({ error: `Only ${product.stock} of ${product.name} left in stock.` });
    }

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({ id: product.id, name: product.name, price: Number(product.price), quantity: 1 });
    }

    req.session.cart = cart;
    res.json({ ok: true, cartCount: cart.reduce((n, i) => n + i.quantity, 0) });
  });
});

// ---------- Route: Update Item Quantity in Cart ----------
router.post('/cart/update', initializeCart, (req, res) => {
  const { productId, quantity } = req.body;
  const qty = parseInt(quantity, 10);
  const id = parseInt(productId, 10);

  if (!id || Number.isNaN(qty)) {
    return res.status(400).send('Invalid request.');
  }

  if (qty <= 0) {
    req.session.cart = req.session.cart.filter((item) => item.id !== id);
    return res.redirect('/medicinedelivery/cart');
  }

  db.query('SELECT stock FROM medicines WHERE id = ?', [id], (err, results) => {
    if (err || results.length === 0) return res.redirect('/medicinedelivery/cart');
    const stock = results[0].stock;
    const item = req.session.cart.find((i) => i.id === id);
    if (item) {
      item.quantity = Math.min(qty, stock);
    }
    res.redirect('/medicinedelivery/cart');
  });
});

// ---------- Route: Remove Item from Cart ----------
router.post('/cart/remove', initializeCart, (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).send('Product ID is required.');

  req.session.cart = req.session.cart.filter((item) => item.id !== parseInt(productId, 10));
  res.redirect('/medicinedelivery/cart');
});

// ---------- Route: Place an Order ----------
router.post('/order', initializeCart, (req, res) => {
  const { delivery_address } = req.body;
  const total = req.session.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (!delivery_address || delivery_address.trim().length < 8) {
    return res.status(400).render('medicinedelivery/cart', {
      cart: req.session.cart,
      total,
      error: 'Please enter a complete delivery address.',
    });
  }
  if (req.session.cart.length === 0) {
    return res.status(400).render('medicinedelivery/cart', { cart: [], total: 0, error: 'Your cart is empty.' });
  }

  const userId = req.session.user ? req.session.user.id : null;

  db.query(
    'INSERT INTO orders (user_id, total_price, delivery_address, status) VALUES (?, ?, ?, ?)',
    [userId, total, delivery_address.trim(), 'placed'],
    (err, result) => {
      if (err) {
        console.error('Failed to place order:', err);
        return res.status(500).render('medicinedelivery/cart', { cart: req.session.cart, total, error: 'Failed to place order. Please try again.' });
      }

      const orderId = result.insertId;
      const orderItems = req.session.cart.map((item) => [orderId, item.id, item.price, item.quantity]);

      db.query('INSERT INTO order_items (order_id, medicine_id, price, quantity) VALUES ?', [orderItems], (err) => {
        if (err) {
          console.error('Failed to process order items:', err);
          return res.status(500).render('medicinedelivery/cart', { cart: req.session.cart, total, error: 'Failed to process order items.' });
        }

        req.session.cart = [];
        res.redirect(`/medicinedelivery/order/${orderId}`);
      });
    }
  );
});

// ---------- Route: Display Order Details (with live status tracking) ----------
router.get('/order/:id', (req, res) => {
  const orderId = req.params.id;

  db.query('SELECT * FROM orders WHERE id = ?', [orderId], (err, results) => {
    if (err || results.length === 0) return res.status(404).render('medicinedelivery/orderDetails', { order: null, items: [], statusOrder: STATUS_ORDER, statusLabels: STATUS_LABELS });

    const order = results[0];

    db.query(
      `SELECT oi.quantity, oi.price, m.name AS medicine_name
       FROM order_items oi
       JOIN medicines m ON m.id = oi.medicine_id
       WHERE oi.order_id = ?`,
      [orderId],
      (err, items) => {
        if (err) return res.status(500).send('Failed to fetch order details.');
        res.render('medicinedelivery/orderDetails', {
          order,
          items,
          statusOrder: STATUS_ORDER,
          statusLabels: STATUS_LABELS,
        });
      }
    );
  });
});

// ---------- Route: Advance Order Status (real-time) ----------
// NOTE: there is no admin/staff role system in this project yet, so this
// endpoint is intentionally unauthenticated for demo purposes. Before real
// deployment, this needs to be locked down to pharmacy staff accounts.
router.post('/order/:id/advance', (req, res) => {
  const orderId = req.params.id;

  db.query('SELECT status FROM orders WHERE id = ?', [orderId], (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ error: 'Order not found.' });

    const currentIndex = STATUS_ORDER.indexOf(results[0].status);
    if (currentIndex === -1 || currentIndex === STATUS_ORDER.length - 1) {
      return res.status(400).json({ error: 'Order is already at its final status.' });
    }

    const nextStatus = STATUS_ORDER[currentIndex + 1];

    db.query('UPDATE orders SET status = ? WHERE id = ?', [nextStatus, orderId], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update order status.' });

      const io = req.app.get('io');
      if (io) {
        io.to(`order-${orderId}`).emit('order:status', { orderId: Number(orderId), status: nextStatus, label: STATUS_LABELS[nextStatus] });
      }

      res.json({ ok: true, status: nextStatus });
    });
  });
});

module.exports = router;
