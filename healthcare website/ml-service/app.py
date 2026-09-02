"""
MediConnect ML service - symptom -> likely disease prediction.

A small, focused Flask API in front of the trained RandomForestClassifier.
The Node/Express app calls this over HTTP; it never touches scikit-learn
or the model file directly, so the two stacks stay cleanly separated.

Endpoints:
    GET  /health              -> {"status": "ok", "diseases": 41, "symptoms": 132}
    GET  /symptoms             -> full list of {key, label} for the picker UI
    POST /predict {symptoms: [...]}
                                -> top-3 {disease, confidence, description,
                                   precautions, medications}

Run:
    python3 app.py                # dev server on :5001
    gunicorn -w 2 -b 0.0.0.0:5001 app:app   # production
"""
import os

import joblib
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # the Node app and this service run on different ports/hosts

MODEL_PATH = os.environ.get("MODEL_PATH", "model.pkl")
_bundle = None


def get_bundle():
    """Lazy-load the model once per process instead of per-request."""
    global _bundle
    if _bundle is None:
        if not os.path.exists(MODEL_PATH):
            raise RuntimeError(
                f"{MODEL_PATH} not found - run `python3 train.py` first to train and save the model."
            )
        _bundle = joblib.load(MODEL_PATH)
    return _bundle


@app.get("/health")
def health():
    try:
        bundle = get_bundle()
        return jsonify(
            status="ok",
            diseases=len(bundle["label_encoder"].classes_),
            symptoms=len(bundle["symptom_columns"]),
        )
    except Exception as exc:  # noqa: BLE001
        return jsonify(status="error", detail=str(exc)), 503


@app.get("/symptoms")
def list_symptoms():
    bundle = get_bundle()
    items = [
        {"key": key, "label": bundle["symptom_display"][key]}
        for key in bundle["symptom_columns"]
    ]
    items.sort(key=lambda i: i["label"])
    return jsonify(symptoms=items)


@app.post("/predict")
def predict():
    bundle = get_bundle()
    payload = request.get_json(silent=True) or {}
    selected = payload.get("symptoms")

    if not isinstance(selected, list) or not selected:
        return jsonify(error="Provide a non-empty 'symptoms' array."), 400

    symptom_columns = bundle["symptom_columns"]
    valid_keys = set(symptom_columns)
    selected_valid = [s for s in selected if s in valid_keys]

    if not selected_valid:
        return jsonify(
            error="None of the provided symptoms were recognized.",
            hint="GET /symptoms for the valid list of symptom keys.",
        ), 400

    # Build a single-row feature vector matching the model's training
    # column order exactly - this is the part that's easy to get subtly
    # wrong (column order mismatches silently give nonsense predictions).
    row = {col: 0 for col in symptom_columns}
    for s in selected_valid:
        row[s] = 1
    # Use a DataFrame with the training-time column names/order rather than
    # a bare list - RandomForest was fit on named columns, and matching
    # that avoids a silent sklearn feature-name mismatch warning.
    X = pd.DataFrame([row], columns=symptom_columns)

    model = bundle["model"]
    probabilities = model.predict_proba(X)[0]
    label_encoder = bundle["label_encoder"]

    ranked = sorted(
        zip(label_encoder.classes_, probabilities), key=lambda p: p[1], reverse=True
    )
    top3 = ranked[:3]

    disease_info = bundle.get("disease_info", {})
    results = []
    for disease, prob in top3:
        info = disease_info.get(disease, {})
        results.append(
            {
                "disease": disease,
                "confidence": round(float(prob), 4),
                "description": info.get("description"),
                "precautions": info.get("precautions", []),
            }
        )

    return jsonify(
        symptoms_used=selected_valid,
        symptoms_ignored=[s for s in selected if s not in valid_keys],
        predictions=results,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
