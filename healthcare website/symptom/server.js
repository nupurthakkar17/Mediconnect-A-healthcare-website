const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

// Base URL of the Python ML microservice (see /ml-service). Configurable
// via env so this can point at a different host in production without a
// code change.
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

// Cache the symptom list in memory - it only changes when the model is
// retrained, so there's no reason to hit the ML service on every page
// load. If the service is briefly unavailable we still serve the last
// known list rather than breaking the page.
let symptomListCache = null;
let symptomListCachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getSymptomList() {
  const isStale = Date.now() - symptomListCachedAt > CACHE_TTL_MS;
  if (symptomListCache && !isStale) return symptomListCache;

  const res = await fetch(`${ML_SERVICE_URL}/symptoms`, { timeout: 5000 });
  if (!res.ok) throw new Error(`ML service /symptoms returned ${res.status}`);
  const data = await res.json();
  symptomListCache = data.symptoms; // [{ key, label }]
  symptomListCachedAt = Date.now();
  return symptomListCache;
}

router.get('/', async (req, res) => {
  try {
    const symptoms = await getSymptomList();
    res.render('symptom/symptom', {
      symptomOptions: symptoms,
      selected: [],
      predictions: null,
      serviceDown: false,
      error: null,
    });
  } catch (err) {
    console.error('[symptom] Could not reach ML service:', err.message);
    res.render('symptom/symptom', {
      symptomOptions: [],
      selected: [],
      predictions: null,
      serviceDown: true,
      error: null,
    });
  }
});

router.post('/check', async (req, res) => {
  let selected = req.body.symptoms || [];
  if (!Array.isArray(selected)) selected = [selected];
  selected = selected.filter(Boolean);

  let symptomOptions = [];
  try {
    symptomOptions = await getSymptomList();
  } catch (err) {
    console.error('[symptom] Could not reach ML service for symptom list:', err.message);
  }

  if (selected.length === 0) {
    return res.render('symptom/symptom', {
      symptomOptions,
      selected: [],
      predictions: null,
      serviceDown: symptomOptions.length === 0,
      error: 'Select at least one symptom.',
    });
  }

  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptoms: selected }),
      timeout: 8000,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return res.render('symptom/symptom', {
        symptomOptions,
        selected,
        predictions: null,
        serviceDown: false,
        error: body.error || 'Could not process those symptoms. Please try again.',
      });
    }

    const data = await response.json();
    res.render('symptom/symptom', {
      symptomOptions,
      selected,
      predictions: data.predictions,
      serviceDown: false,
      error: null,
    });
  } catch (err) {
    console.error('[symptom] ML service /predict failed:', err.message);
    res.render('symptom/symptom', {
      symptomOptions,
      selected,
      predictions: null,
      serviceDown: true,
      error: null,
    });
  }
});

router.get('/appointment', (req, res) => {
  res.redirect('/appointments/book-appointment');
});

module.exports = router;
