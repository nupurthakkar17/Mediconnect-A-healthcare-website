// Find Care - a single module that replaces three near-identical modules
// that used to exist separately (fcm, labs, beds). All three were doing
// the same thing - search a location-based facility table and render a
// list - so they're unified here into one router with a tabbed UI instead
// of three disconnected pages that each reimplemented the same pattern.
const express = require('express');
const router = express.Router();
const db = require('../db');

const TABS = ['clinics', 'labs', 'beds'];

function getTab(req) {
  return TABS.includes(req.query.tab) ? req.query.tab : 'clinics';
}

// ---------- Unified search across clinics / labs / hospital beds ----------
router.get('/', (req, res) => {
  const tab = getTab(req);
  const q = (req.query.q || '').trim();

  const queries = {
    clinics: q
      ? ['SELECT * FROM clinics WHERE address LIKE ? ORDER BY name', [`%${q}%`]]
      : ['SELECT * FROM clinics ORDER BY name', []],
    labs: q
      ? ['SELECT * FROM labs WHERE city LIKE ? ORDER BY distance', [`%${q}%`]]
      : ['SELECT * FROM labs ORDER BY city, distance', []],
    beds: q
      ? ['SELECT * FROM HospitalBeds WHERE location LIKE ? ORDER BY available_beds DESC', [`%${q}%`]]
      : ['SELECT * FROM HospitalBeds ORDER BY location, hospital_name', []],
  };

  const [sql, params] = queries[tab];

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error('[findcare] query error:', err);
      return res.status(500).render('findcare/index', { tab, q, results: [], error: 'Something went wrong. Please try again.' });
    }
    res.render('findcare/index', {
      tab,
      q,
      results,
      error: q && results.length === 0 ? `No results found for "${q}".` : null,
    });
  });
});

// ---------- Clinic booking ----------
router.get('/clinics/:id/book', (req, res) => {
  db.query('SELECT * FROM clinics WHERE id = ?', [req.params.id], (err, results) => {
    if (err || results.length === 0) return res.status(404).send('Clinic not found.');
    res.render('findcare/clinic-book', { clinic: results[0], error: null });
  });
});

router.post('/clinics/:id/book', (req, res) => {
  const { name, contact, preferredDate, preferredTime } = req.body;
  const clinicId = req.params.id;

  const renderWithError = (message) => {
    db.query('SELECT * FROM clinics WHERE id = ?', [clinicId], (err, results) => {
      res.status(400).render('findcare/clinic-book', {
        clinic: results && results[0] ? results[0] : null,
        error: message,
      });
    });
  };

  if (!name || !contact || !preferredDate || !preferredTime) {
    return renderWithError('All fields are required.');
  }

  const userId = req.session.user ? req.session.user.id : null;

  db.query(
    'INSERT INTO clinic_bookings (clinic_id, user_id, name, contact, preferred_date, preferred_time) VALUES (?, ?, ?, ?, ?, ?)',
    [clinicId, userId, name, contact, preferredDate, preferredTime],
    (err) => {
      if (err) {
        console.error('[findcare] booking error:', err);
        return renderWithError('Could not book this slot. Please try again.');
      }
      res.render('findcare/clinic-book-success', { name });
    }
  );
});

// ---------- Lab detail ----------
router.get('/labs/:id', (req, res) => {
  db.query('SELECT * FROM labs WHERE id = ?', [req.params.id], (err, results) => {
    if (err || results.length === 0) return res.status(404).render('findcare/lab-details', { lab: null });
    res.render('findcare/lab-details', { lab: results[0] });
  });
});

// ---------- Bed availability update (demo/staff endpoint, real-time) ----------
router.post('/beds/:id/update', (req, res) => {
  const { id } = req.params;
  const beds = parseInt(req.body.available_beds, 10);

  if (Number.isNaN(beds) || beds < 0) {
    return res.status(400).json({ error: 'available_beds must be a non-negative number.' });
  }

  db.query('UPDATE HospitalBeds SET available_beds = ? WHERE id = ?', [beds, id], (err) => {
    if (err) {
      console.error('[findcare] beds update error:', err);
      return res.status(500).json({ error: 'Failed to update bed count.' });
    }
    const io = req.app.get('io');
    if (io) {
      io.to('beds-room').emit('beds:update', { id: Number(id), available_beds: beds });
    }
    res.json({ ok: true, id: Number(id), available_beds: beds });
  });
});

module.exports = router;
