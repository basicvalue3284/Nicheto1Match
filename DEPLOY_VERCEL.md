# Deploy NicheTo1Match to Vercel

This app is protected by built-in Basic Auth. Set a strong `APP_PASS` before making the deployment public.

## Target URL

Use this Vercel project name:

```text
nicheto1match
```

The default production URL will be:

```text
https://nicheto1match.vercel.app
```

## Required Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

```text
APP_USER=admin
APP_PASS=<strong-password>
OPENAI_API_KEY=<your-openai-key>
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=<optional-gemini-key>
GEMINI_MODEL=gemini-1.5-flash
AI_PROVIDER=openai
RAPIDAPI_KEY=<your-rapidapi-key>
BATCH_SIZE=25
```

## Deploy With Vercel CLI

From this project folder:

```bash
npm install -g vercel
vercel login
vercel --prod --name nicheto1match
```

When Vercel asks for project settings, keep the defaults. The app entrypoint is configured in `pyproject.toml`.

## Privacy

The app itself asks for a username/password through Basic Auth. Vercel also has deployment protection in the dashboard if you want an additional Vercel-level gate.

## Important Limitation

This Vercel setup is good for a private test URL. Job history is stored in temporary serverless storage on Vercel, so it may not persist permanently across cold starts or redeploys. For permanent job history, move storage to a database or deploy the Docker version to Cloud Run.
