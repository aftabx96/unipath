# UniPath — Pakistan University Admission Counselor

A full-stack admission helper for Pakistani students. A Python/Flask backend
serves university data and three ML models (K-Means tiers, Decision Tree
admission signal, KNN similarity) plus an AI chat counselor. A vanilla
HTML/CSS/JS frontend provides a themeable dashboard.

## Features
- **60+ universities across 24 cities** and all provinces/regions (Sindh, Punjab, KPK, Balochistan, Federal, AJK, GB).
- **6 themes** (Light, Dark, Ocean, Sunset, Grape, Mono) — your choice is remembered.
- **University Explorer** with search + city / province / program / sort filters.
- **Deadline Tracker** — live countdowns, urgency colours, and a personal "tracked" list.
- **Shortlist** — save favourites and export them to CSV.
- **Compare** — up to 4 universities side by side.
- **AI tools** — Recommend, Predict (admission chance), Similar, and Tiers.
- **AI Chat counselor** powered by Groq, with a local data-grounded fallback.
- **Works offline** — if the backend isn't running, the frontend uses a bundled
  copy of the data so browsing, deadlines, shortlist, and compare still work.

## Project structure
```
admission-counselor/
├── backend/
│   ├── app.py            # Flask API + ML models + Groq chat
│   └── .env.example      # copy to .env and add your Groq key
├── frontend/
│   ├── index.html
│   ├── styles.css        # theming system
│   ├── app.js            # all UI logic
│   ├── universities-data.js  # offline fallback dataset
│   └── logo.svg
├── data/
│   └── universities.csv  # source of truth for the backend
└── requirement.txt
```

## Setup

### 1. Backend
```bash
cd admission-counselor
python -m venv backend/venv
 Windows: .\venv\Scripts\activate

pip install -r requirement.txt

python backend/app.py                  # runs on http://127.0.0.1:5000
```

### 2. Frontend
Open `frontend/index.html` in your browser, or serve it:
```bash
cd frontend
python -m http.server 5500
# visit http://127.0.0.1:5500
```

## The chatbot fix
The old code requested Groq model `llama3-8b-8192`, which Groq **decommissioned**
(announced 31 May 2025). Every chat call returned a `model_decommissioned` 400
error. This version uses the supported `llama-3.1-8b-instant` model and, if the
key is missing or Groq errors out, returns a useful local answer built from the
dataset so the chat never appears "dead".

## Security note
Never commit a real API key. `.env` is git-ignored. If a key was ever shared or
pushed, **rotate it** in the Groq console — treat it as compromised.

## Adding universities
Edit `data/universities.csv` (used by the backend). To keep the offline frontend
in sync, also add the same row to `frontend/universities-data.js`.
