"""
Train a symptom -> disease classifier for the MediConnect symptom checker.

Dataset: 4,920 rows x 132 binary symptom columns + 1 label ("prognosis"),
41 possible diseases. Source: a public mirror of the well-known Kaggle
"Disease Prediction Using Machine Learning" dataset (see README.md for the
exact origin and an honest note on its limitations).

Run:
    python3 train.py

Produces:
    model.pkl        - trained classifier + label encoder + symptom column
                        order + supplementary disease info, all in one file
                        (loaded by app.py at request time)
    metrics.json      - held-out test accuracy / F1 / per-class report, so
                        the number quoted in the README/README is real and
                        reproducible, not a guess
"""
import json

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

DATASET_DIR = "dataset"


def humanize(symptom_key: str) -> str:
    """'stomach_pain' -> 'Stomach pain' for display in the UI."""
    words = symptom_key.replace("__", "_").strip().split("_")
    words = [w for w in words if w]
    text = " ".join(words)
    return text[:1].upper() + text[1:] if text else symptom_key


def load_supplementary_info():
    """Best-effort load of description/precautions/medication lookups.

    These are supplementary (nice-to-have) - if any file is missing or
    malformed, we degrade gracefully to an empty lookup rather than
    failing the whole training run over a missing side file.
    """
    info = {}

    try:
        desc = pd.read_csv(f"{DATASET_DIR}/description.csv")
        for _, row in desc.iterrows():
            disease = row["Disease"].strip()
            info.setdefault(disease, {})["description"] = row["Description"].strip()
    except Exception as exc:  # noqa: BLE001 - genuinely best-effort
        print(f"[train] Skipping description.csv ({exc})")

    try:
        prec = pd.read_csv(f"{DATASET_DIR}/precautions_df.csv")
        prec_cols = [c for c in prec.columns if c.lower().startswith("precaution")]
        for _, row in prec.iterrows():
            disease = row["Disease"].strip()
            steps = [str(row[c]).strip() for c in prec_cols if pd.notna(row[c]) and str(row[c]).strip()]
            info.setdefault(disease, {})["precautions"] = steps
    except Exception as exc:  # noqa: BLE001
        print(f"[train] Skipping precautions_df.csv ({exc})")

    # NOTE: medications.csv is intentionally NOT loaded here. Spot-checking
    # it during development turned up a systemic row misalignment in the
    # source file - e.g. "Heart attack" is mapped to varicose-vein
    # treatments, "Varicose veins" to hypothyroidism drugs, and so on for
    # every row after "Alcoholic hepatitis". That's not a join bug in this
    # script (Disease/Medication are read from the same row), it's wrong
    # in the upstream CSV itself. Surfacing incorrect medication
    # suggestions in a healthcare app is a real safety issue, not a minor
    # cosmetic one, so this field is left out until the source data can be
    # independently verified. description.csv and precautions_df.csv were
    # each spot-checked against their disease names and are consistent.

    return info


def main():
    df = pd.read_csv(f"{DATASET_DIR}/Training.csv")

    # The source CSV has a stray trailing unnamed column in some mirrors -
    # drop anything that isn't a real feature or the label.
    df = df.loc[:, ~df.columns.str.contains("^Unnamed")]

    label_col = "prognosis"
    symptom_columns = [c for c in df.columns if c != label_col]

    X = df[symptom_columns].astype(int)
    y_raw = df[label_col].str.strip()

    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(y_raw)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=None,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    f1_macro = f1_score(y_test, y_pred, average="macro")
    report = classification_report(
        y_test, y_pred, target_names=label_encoder.classes_, output_dict=True, zero_division=0
    )

    print(f"Held-out test accuracy: {accuracy:.4f}")
    print(f"Held-out test macro F1: {f1_macro:.4f}")

    metrics = {
        "test_accuracy": accuracy,
        "test_macro_f1": f1_macro,
        "n_train": len(X_train),
        "n_test": len(X_test),
        "n_symptoms": len(symptom_columns),
        "n_diseases": len(label_encoder.classes_),
        "per_class_report": report,
        "note": (
            "This dataset encodes each disease as a small number of fixed "
            "symptom combinations, so held-out accuracy is high and should "
            "be read as 'the model learned the dataset's symptom patterns "
            "correctly', not as a claim about real-world diagnostic "
            "accuracy on messy, self-reported symptoms."
        ),
    }
    with open("metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    supplementary = load_supplementary_info()

    bundle = {
        "model": model,
        "label_encoder": label_encoder,
        "symptom_columns": symptom_columns,
        "symptom_display": {s: humanize(s) for s in symptom_columns},
        "disease_info": supplementary,
    }
    joblib.dump(bundle, "model.pkl")
    print(f"Saved model.pkl ({len(symptom_columns)} symptoms, {len(label_encoder.classes_)} diseases)")


if __name__ == "__main__":
    main()
