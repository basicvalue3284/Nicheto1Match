# Deploy NicheTo1Match to Cloud Run

This is the recommended live setup for the current tool.

Cloud Run gives us a private, password-protected web app that scales to zero when idle. Job data is temporary by design, which matches the workflow: upload titles, process, download/copy the output, then move on.

## Service

```text
nicheto1match
```

Region:

```text
us-central1
```

## One-Time Google Cloud Setup

Install and sign in to the Google Cloud CLI, then run:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com containerregistry.googleapis.com
```

Cloud Build needs permission to deploy to Cloud Run:

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## Deploy

From this folder:

```bash
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_APP_USER=admin,_APP_PASS=YOUR_STRONG_PASSWORD
```

The deploy will print a live URL like:

```text
https://nicheto1match-xxxxx-uc.a.run.app
```

## Add API Keys

After deploy, add the API keys as Cloud Run environment variables:

```bash
gcloud run services update nicheto1match \
  --region=us-central1 \
  --set-env-vars=OPENAI_API_KEY=YOUR_OPENAI_KEY,GEMINI_API_KEY=YOUR_GEMINI_KEY,RAPIDAPI_KEY=YOUR_RAPIDAPI_KEY
```

If you only use OpenAI, `GEMINI_API_KEY` can be left out.

## Cost Controls

The included Cloud Run config is tuned for solo use:

- `min-instances=0`: scales to zero when idle.
- `max-instances=1`: prevents surprise parallel instance costs.
- `memory=1Gi`, `cpu=1`: enough room for uploads and API processing.
- `timeout=3600`: allows longer title batches.

For light solo usage, Cloud Run hosting should usually stay free or near-free. OpenAI/Gemini/RapidAPI charges are separate.

## Temporary Data

`DATA_ROOT=/tmp/nicheto1match/data` is set during deploy. This means uploaded runs and saved settings are temporary on Cloud Run. Download/copy your results after each run.
