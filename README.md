# Niche Pipeline

Server-backed replacement for TitleBanker. Upload/paste YouTube titles, deduplicate, segregate, run extraction/cleaning from examples, run the policy checker prompt, and export ready/master CSVs.

**v0.2 status:** Phase 1 is implemented: upload, segregation, batch clean + policy, progress/status, JSON-backed resume, and CSV exports. RapidAPI matching and Google Sheets push are intentionally left for a later phase.

---

## Run locally

```bash
# 1. Clone or download this folder
cd niche_pipeline

# 2. Set up Python env
python3 -m venv .venv
source .venv/bin/activate

# 3. Install deps
pip install -r requirements.txt

# 4. Set auth credentials (change these!)
cp .env.example .env
# Edit .env and change APP_USER + APP_PASS + OPENAI_API_KEY

# 5. Boot
export $(cat .env | xargs)
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000`. Use the credentials you set in `.env`.

If your system `python3` is very new and dependency install fails, use Python 3.12.

---

## Deploy to Google Cloud Run

### One-time setup (~15 min)

```bash
# 1. Set your project (replace with yours)
gcloud config set project YOUR_PROJECT_ID

# 2. Enable required services
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

# 3. Grant Cloud Build permission to deploy to Cloud Run
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### Deploy (one command)

```bash
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_APP_USER=YOUR_USERNAME,_APP_PASS=YOUR_STRONG_PASSWORD
```

The first deploy takes ~3 minutes. You'll get a URL like `https://niche-pipeline-xxxxx-uc.a.run.app`. Open it, log in with the credentials you set.

Add your OpenAI key to Cloud Run after deploy:

```bash
gcloud run services update niche-pipeline \
  --region=us-central1 \
  --set-env-vars=OPENAI_API_KEY=YOUR_OPENAI_KEY
```

### Re-deploy after code changes

Same command. Cloud Build picks up changes automatically.

---

## Deploy to Vercel

Vercel deployment files are included:

- `pyproject.toml` points Vercel to `app.main:app`.
- `vercel.json` keeps the Python bundle small.
- `.vercelignore` prevents local runs, saved data, and local secrets from being uploaded.

See `DEPLOY_VERCEL.md` for the exact private deployment steps and required environment variables. Vercel is best for a private test URL; for permanent job history, use a database or the Cloud Run Docker deployment.

### Connect to GitHub for auto-deploy (optional)

In the Cloud Console: **Cloud Build → Triggers → Create Trigger** → connect your GitHub repo → push to main triggers deploy. After this, every `git push` redeploys.

---

## Cost estimate

- **Cloud Run:** scales to zero. Free tier covers 2M requests + 360k GB-seconds/month. Your usage is well under this.
- **Cloud Build:** 120 build-minutes/day free. Each deploy uses ~2 min. Effectively free.
- **All-in:** $0/month at solo usage.

---

## Project structure

```
niche_pipeline/
├── app/
│   ├── main.py              # FastAPI app + routes
│   ├── pipeline/
│   │   ├── defaults.py      # Workbook-derived examples + policy prompt
│   │   ├── parser.py        # CSV/XLSX/text -> title list
│   │   ├── processor.py     # Batch OpenAI clean + policy runner
│   │   └── segregate.py     # 4-rule classifier
│   ├── store/
│   │   └── jobs.py          # JSON-backed job persistence
│   ├── templates/
│   │   ├── base.html
│   │   ├── index.html       # Upload/work settings page
│   │   └── job.html         # Progress/results/export page
│   └── static/
├── Dockerfile               # Container build for Cloud Run
├── cloudbuild.yaml          # Cloud Build deploy config
├── requirements.txt         # Python deps
├── .env.example             # Auth template
├── .gitignore
├── .dockerignore
└── README.md
```

---

## Roadmap

| Session | Stage | What it adds |
|--------|-------|--------------|
| Phase | Stage | What it adds |
|-------|-------|--------------|
| Phase 1 | Upload + Segregate | Upload/paste, dedupe, classify into four buckets ✅ |
| Phase 1 | Clean + Policy | LLM-driven cleaning from examples + policy classifier prompt ✅ |
| Phase 1 | Export | Ready CSV + Master CSV ✅ |
| Phase 2 | Match + Subs | RapidAPI search, exact-match count, subscriber bucket |
| Phase 3 | Push to Sheets | Google Sheets handoff |
| Phase 4 | Cloud persistence | Firestore/Cloud Storage job history and longer-term resume |

---

## Built with

- **FastAPI** — async Python web framework
- **HTMX** — dynamic UI without a JS build step
- **Tailwind CSS** (via CDN) — styling
- **openpyxl** — XLSX parsing
- **Cloud Run + Cloud Build** — hosting and deploy
