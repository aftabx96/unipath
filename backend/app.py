"""
UniPath — University Admission Counselor (Flask Backend)
========================================================
ML Models:
  - KMeans        : University tier clustering (Budget / Mid-Range / Premium)
  - Decision Tree : Admission likelihood signal
  - KNN           : Find similar universities

AI Chat:
  - Groq (free tier). Model: llama-3.1-8b-instant
  - IMPORTANT: the old "llama3-8b-8192" model was decommissioned by Groq
    (announced 31 May 2025). Requesting it returns a 400 "model_decommissioned"
    error — that is why the chat used to fail. We now use a supported model and
    fall back to a local, data-grounded answer if Groq is unavailable.

Setup:
  pip install -r requirement.txt
  Create backend/.env with:  GROQ_API_KEY=your_key_here   (free at console.groq.com)
  python backend/app.py
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
import os
import requests as req
from pathlib import Path
from dotenv import load_dotenv

from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

# ─────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────
load_dotenv()

# Supported Groq models (pick a fast, free one). See:
# https://console.groq.com/docs/deprecations
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

app = Flask(__name__)
CORS(app)  # Allow the frontend to call this backend

# ─────────────────────────────────────────
# LOAD DATA
# ─────────────────────────────────────────
BASE_DIR  = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR.parent / 'data' / 'universities.csv'

df = pd.read_csv(DATA_FILE)

REQUIRED_COLS = ['name', 'city', 'min_merit', 'max_merit', 'fee_per_year', 'hec_rank', 'programs']
for col in REQUIRED_COLS:
    if col not in df.columns:
        raise ValueError(f"Missing required column in CSV: '{col}'")

df.dropna(subset=['min_merit', 'max_merit', 'fee_per_year', 'hec_rank'], inplace=True)
df.reset_index(drop=True, inplace=True)

# ─────────────────────────────────────────
# ML SETUP — runs once at startup
# ─────────────────────────────────────────
feature_cols   = ['min_merit', 'max_merit', 'fee_per_year', 'hec_rank']
features_raw    = df[feature_cols].copy()
scaler          = StandardScaler()
features_scaled = scaler.fit_transform(features_raw)

# 1. K-MEANS — cluster into 3 tiers
kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
df['cluster'] = kmeans.fit_predict(features_scaled)
cluster_fees = df.groupby('cluster')['fee_per_year'].mean().sort_values()
tier_map = {
    cluster_fees.index[0]: 'Budget',
    cluster_fees.index[1]: 'Mid-Range',
    cluster_fees.index[2]: 'Premium',
}
df['tier'] = df['cluster'].map(tier_map)

# 2. DECISION TREE — competitiveness signal
df['label'] = (df['min_merit'] <= df['max_merit'] * 0.88).astype(int)
dt_model = DecisionTreeClassifier(max_depth=4, random_state=42)
dt_model.fit(features_raw, df['label'])

# 3. KNN — similarity by feature space
knn_model = KNeighborsClassifier(n_neighbors=min(5, len(df)))
knn_model.fit(features_scaled, df['cluster'])

print("ML models trained successfully.")
print(f"Loaded {len(df)} universities | Tiers: {df['tier'].value_counts().to_dict()}")

# ─────────────────────────────────────────
# CHAT HELPERS
# ─────────────────────────────────────────
def _local_answer(message: str) -> str:
    """Data-grounded fallback used when Groq is unavailable."""
    q = message.lower()
    rows = df.to_dict('records')

    def fmt(items):
        return "\n".join(
            f"- {r['name']} ({r['city']}): fee PKR {int(r['fee_per_year']):,}, "
            f"merit {r['min_merit']}-{r['max_merit']}%"
            for r in items[:5]
        )

    cities = {str(r['city']).lower() for r in rows}
    city = next((c for c in cities if c in q), None)
    prog = next((p for p in ['cs', 'ai', 'business', 'medicine', 'engineering', 'law', 'pharmacy']
                 if p in q), None)

    pool = rows
    if city:
        pool = [r for r in pool if str(r['city']).lower() == city]
    if prog:
        pool = [r for r in pool if prog in str(r['programs']).lower()]

    if any(w in q for w in ['cheap', 'affordable', 'lowest fee']):
        pool = sorted(pool or rows, key=lambda r: r['fee_per_year'])
        return "Most affordable options:\n" + fmt(pool)
    if 'deadline' in q or 'closing' in q:
        pool = sorted([r for r in pool if r.get('deadline')], key=lambda r: str(r['deadline']))
        return "Earliest deadlines:\n" + "\n".join(
            f"- {r['name']} ({r['city']}): {r['deadline']}" for r in pool[:5])
    if city or prog:
        if not pool:
            return "I couldn't find universities matching that. Try another city, program, or budget."
        pool = sorted(pool, key=lambda r: r['hec_rank'])
        return "Matching universities:\n" + fmt(pool)

    return ("I can answer from the university database — try asking for the cheapest CS "
            "universities, options in a specific city, or which deadlines are closing soon.")


def call_groq(prompt: str):
    """Call Groq. Returns (reply, used_ai: bool)."""
    api_key = os.getenv('GROQ_API_KEY')
    if not api_key:
        return None, False
    try:
        response = req.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500,
                "temperature": 0.7,
            },
            timeout=20,
        )
        result = response.json()
        if 'choices' in result:
            return result['choices'][0]['message']['content'].strip(), True
        # Surface the real error in the server log to aid debugging
        print("Groq error:", result.get('error'))
        return None, False
    except Exception as e:
        print("Groq exception:", e)
        return None, False

# ─────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────
@app.route('/')
def home():
    return jsonify({
        "status": "running",
        "message": "UniPath Admission Counselor API is live!",
        "model": GROQ_MODEL,
        "routes": ["/universities", "/recommend", "/predict", "/similar", "/tiers", "/chat", "/stats"],
    })


@app.route('/universities', methods=['GET'])
def get_universities():
    return jsonify(df.drop(columns=['cluster', 'label']).to_dict(orient='records'))


@app.route('/stats', methods=['GET'])
def stats():
    return jsonify({
        "total": int(len(df)),
        "cities": int(df['city'].nunique()),
        "provinces": int(df['province'].nunique()) if 'province' in df else None,
        "avg_fee": float(df['fee_per_year'].mean()),
        "min_fee": float(df['fee_per_year'].min()),
        "max_fee": float(df['fee_per_year'].max()),
    })


@app.route('/recommend', methods=['POST'])
def recommend():
    data    = request.json or {}
    merit   = float(data.get('merit', 0))
    budget  = float(data.get('budget', 0))
    city    = data.get('city', '').strip().lower()
    program = data.get('program', '').strip()

    filtered = df[(df['min_merit'] <= merit) & (df['fee_per_year'] <= budget)].copy()
    if city:
        filtered = filtered[filtered['city'].str.lower() == city]
    if program:
        filtered = filtered[filtered['programs'].str.contains(program, case=False, na=False)]

    if filtered.empty:
        return jsonify({"message": "No universities found matching your criteria.", "results": []})

    filtered = filtered.sort_values('hec_rank')
    result = filtered.drop(columns=['cluster', 'label']).to_dict(orient='records')
    return jsonify({"count": len(result), "results": result})


@app.route('/predict', methods=['POST'])
def predict():
    data          = request.json or {}
    student_merit = float(data.get('merit', 0))
    uni_name      = data.get('university', '').strip()

    uni_row = df[df['name'].str.lower() == uni_name.lower()]
    if uni_row.empty:
        return jsonify({"error": f"University '{uni_name}' not found in database."}), 404

    uni = uni_row.iloc[0]
    min_m, max_m = float(uni['min_merit']), float(uni['max_merit'])
    mid_m = (min_m + max_m) / 2

    input_features = [[min_m, max_m, uni['fee_per_year'], uni['hec_rank']]]
    dt_prob       = dt_model.predict_proba(input_features)[0]
    dt_confidence = round(float(max(dt_prob)) * 100, 1)

    if student_merit >= max_m - 2:
        chance, color, percent = "Very High", "green", 90
    elif student_merit >= mid_m:
        chance, color, percent = "Good", "yellow", 70
    elif student_merit >= min_m:
        chance, color, percent = "Moderate", "orange", 45
    else:
        chance, color, percent = "Low", "red", 15

    return jsonify({
        "university": uni_name, "student_merit": student_merit,
        "required_merit": f"{min_m}% – {max_m}%", "chance": chance, "color": color,
        "percent": percent, "tier": uni['tier'], "dt_confidence": dt_confidence,
        "message": (f"Your admission chance at {uni_name} is {chance} ({percent}%). "
                    f"This university is in the {uni['tier']} tier (K-Means). "
                    f"Decision Tree confidence: {dt_confidence}%."),
    })


@app.route('/similar', methods=['POST'])
def similar():
    data     = request.json or {}
    uni_name = data.get('university', '').strip()

    uni_row = df[df['name'].str.lower() == uni_name.lower()]
    if uni_row.empty:
        return jsonify({"error": f"University '{uni_name}' not found in database."}), 404

    idx = uni_row.index[0]
    uni_features = features_scaled[idx].reshape(1, -1)
    n = min(6, len(df))
    distances, indices = knn_model.kneighbors(uni_features, n_neighbors=n)

    similar_unis = []
    for i, dist in zip(indices[0], distances[0]):
        if df.iloc[i]['name'].lower() == uni_name.lower():
            continue
        u = df.iloc[i].drop(['cluster', 'label']).to_dict()
        u['similarity_score'] = round(max(0, 100 - dist * 15), 1)
        similar_unis.append(u)

    return jsonify({"query": uni_name, "similar": similar_unis[:3]})


@app.route('/tiers', methods=['GET'])
def tiers():
    result = []
    for tier in ['Budget', 'Mid-Range', 'Premium']:
        unis = df[df['tier'] == tier][['name', 'city', 'fee_per_year', 'hec_rank', 'tier']]
        result.append({"tier": tier, "count": len(unis),
                       "universities": unis.to_dict(orient='records')})
    return jsonify(result)


@app.route('/chat', methods=['POST'])
def chat():
    data = request.json or {}
    msg  = data.get('message', '').strip()
    if not msg:
        return jsonify({"error": "Message cannot be empty."}), 400

    uni_data = df[['name', 'city', 'min_merit', 'max_merit', 'fee_per_year',
                   'hec_rank', 'programs', 'tier', 'deadline']].to_string(index=False)

    prompt = f"""You are a helpful university admission counselor for Pakistani students.
You have access to this university database:

{uni_data}

Answer the student's question based on this data only. Be friendly, concise, and helpful.
Always respond in English. If the answer is not in the data, say so honestly.

Student's question: {msg}"""

    reply, used_ai = call_groq(prompt)
    if not used_ai:
        # Groq missing/failed → still return a useful, data-grounded answer.
        reply = _local_answer(msg)
    return jsonify({"reply": reply, "source": "groq" if used_ai else "local"})


# ─────────────────────────────────────────
if __name__ == '__main__':
    app.run(debug=True, port=5000)
