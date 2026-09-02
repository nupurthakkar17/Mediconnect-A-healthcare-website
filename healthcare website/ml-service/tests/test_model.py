"""
Tests for the symptom-checker model and Flask API.

Run from ml-service/:
    pytest tests/ -v

These are deliberately not just "does it 200" tests - they check the
things that actually break silently in a model-serving service: column
order, unknown-input handling, and known symptom -> disease sanity checks.
"""
import os
import sys

import joblib
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as flask_app_module  # noqa: E402


@pytest.fixture(scope="module")
def bundle():
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "model.pkl")
    if not os.path.exists(path):
        pytest.skip("model.pkl not found - run `python3 train.py` first")
    return joblib.load(path)


@pytest.fixture()
def client():
    flask_app_module.app.config["TESTING"] = True
    return flask_app_module.app.test_client()


class TestModelBundle:
    def test_symptom_and_disease_counts(self, bundle):
        assert len(bundle["symptom_columns"]) == 132
        assert len(bundle["label_encoder"].classes_) == 41

    def test_every_symptom_has_a_display_label(self, bundle):
        for key in bundle["symptom_columns"]:
            assert key in bundle["symptom_display"]
            assert bundle["symptom_display"][key][0].isupper()

    def test_description_and_precautions_loaded_for_known_disease(self, bundle):
        info = bundle["disease_info"].get("Heart attack")
        assert info is not None
        assert "blood flow" in info["description"].lower()
        assert any("ambulance" in p.lower() for p in info["precautions"])

    def test_medications_field_is_absent(self, bundle):
        # Regression guard: medications.csv was dropped after we found its
        # rows were misaligned with the wrong diseases (e.g. "Heart
        # attack" mapped to varicose-vein treatments). If this starts
        # failing, someone re-added an unverified data source - re-check
        # it against the disease names before wiring it back in.
        for info in bundle["disease_info"].values():
            assert "medications" not in info


class TestPredictEndpoint:
    def test_health_check(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.get_json()["status"] == "ok"

    def test_symptoms_list_endpoint(self, client):
        res = client.get("/symptoms")
        assert res.status_code == 200
        data = res.get_json()["symptoms"]
        assert len(data) == 132
        assert {"key", "label"} <= data[0].keys()

    def test_predict_returns_top_3_ranked_by_confidence(self, client):
        res = client.post("/predict", json={"symptoms": ["high_fever", "cough", "fatigue"]})
        assert res.status_code == 200
        preds = res.get_json()["predictions"]
        assert len(preds) == 3
        confidences = [p["confidence"] for p in preds]
        assert confidences == sorted(confidences, reverse=True)
        assert all(0.0 <= c <= 1.0 for c in confidences)

    def test_known_symptom_combo_predicts_expected_disease(self, client):
        # This exact combination is a real row in the training set for
        # "Fungal infection" - if this stops being the #1 prediction, the
        # model or the training data changed in a way worth investigating.
        res = client.post(
            "/predict",
            json={"symptoms": ["itching", "skin_rash", "nodal_skin_eruptions", "dischromic _patches"]},
        )
        preds = res.get_json()["predictions"]
        assert preds[0]["disease"] == "Fungal infection"

    def test_empty_symptoms_rejected(self, client):
        res = client.post("/predict", json={"symptoms": []})
        assert res.status_code == 400

    def test_missing_symptoms_key_rejected(self, client):
        res = client.post("/predict", json={})
        assert res.status_code == 400

    def test_unknown_symptom_only_is_rejected(self, client):
        res = client.post("/predict", json={"symptoms": ["definitely_not_a_real_symptom"]})
        assert res.status_code == 400

    def test_mix_of_known_and_unknown_symptoms_ignores_unknown(self, client):
        res = client.post(
            "/predict", json={"symptoms": ["high_fever", "not_a_real_symptom_xyz"]}
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["symptoms_used"] == ["high_fever"]
        assert data["symptoms_ignored"] == ["not_a_real_symptom_xyz"]

    def test_response_never_includes_medications_field(self, client):
        res = client.post("/predict", json={"symptoms": ["high_fever", "chest_pain"]})
        for pred in res.get_json()["predictions"]:
            assert "medications" not in pred
