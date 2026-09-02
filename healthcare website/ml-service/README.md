# MediConnect ML Service — Symptom Checker

A small Flask microservice that replaces the platform's old hardcoded
symptom -> disease dictionary with a trained classifier.

## What it does

- `GET /symptoms` — the full list of 132 symptoms (key + display label) the model understands, used to build the picker in the UI
- `POST /predict` — takes a list of symptom keys, returns the top 3 most likely diseases with a confidence score, a description, and precautions
- `GET /health` — used by the Node app to know if the ML service is reachable before offering the symptom checker

## The model

- **Data**: 4,920 rows, 132 binary symptom features, 41 disease labels. Public mirror of the well-known "Disease Prediction Using Machine Learning" dataset ([source repo](https://github.com/sohamvsonar/Disease-Prediction-and-Medical-Recommendation-System)).
- **Model**: `RandomForestClassifier` (300 trees), trained on an 80/20 stratified split.
- **Held-out test accuracy: 100%** (see `metrics.json` for the full per-class report, regenerated every time you run `train.py`).

**Be upfront about that 100% number in an interview or viva** — it's real, but it's not as impressive as it sounds. This dataset encodes each disease as a small number of exact, noise-free symptom combinations, so a model that memorizes those combinations scores perfectly on a held-out split drawn from the same combinations. It shows the model correctly learned the dataset's patterns; it is **not** a claim about diagnostic accuracy on messy, real-world, self-reported symptoms. If asked "would this really hit 100% on real patients", the honest answer is no — real symptom reporting is noisier, symptoms overlap across diseases more, and this dataset doesn't capture that. That's a good, honest thing to say out loud rather than a weakness to hide.

## A data quality bug we found and fixed

The source dataset also ships a `medications.csv` mapping diseases to drug recommendations. While testing this service end-to-end, a "Heart attack" prediction came back suggesting compression stockings and leg elevation — that's actually varicose-vein treatment. Checking the raw file confirmed every row from "Alcoholic hepatitis" onward is shifted relative to the correct disease name — a bug in the upstream data, not in this service's code.

Because shipping incorrect medication suggestions in a healthcare app is a real safety issue, **the medications field was removed entirely** rather than patched around. `description.csv` and `precautions_df.csv` were independently spot-checked and are consistent, so those stayed. `tests/test_model.py` has a regression test (`test_medications_field_is_absent`) so this can't silently come back.

This is worth mentioning as its own talking point: validating a third-party dataset before trusting it, and choosing to cut a feature rather than ship something wrong, is a real engineering judgment call.

## Running it

```bash
pip install -r requirements.txt

# Train the model (only needed once, or whenever Training.csv changes)
python3 train.py

# Run the API
python3 app.py          # dev server on :5001
# or in production:
gunicorn -w 2 -b 0.0.0.0:5001 app:app
```

## Testing

```bash
pytest tests/ -v
```

13 tests covering: model/label counts, unknown-symptom handling, a known symptom combination resolving to its correct disease, response shape, and the medications-field regression guard described above.

## How the Node app talks to this

The `symptom` module in the main app calls this service over HTTP (`ML_SERVICE_URL`, default `http://localhost:5001`) instead of running its own matching logic. If this service is down, the Node app degrades gracefully — it tells the user the checker is temporarily unavailable rather than crashing or falling back to silently wrong data.
