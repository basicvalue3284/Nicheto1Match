# YouTube Production Workflow

Lightweight Next.js dashboard for generating a YouTube tutorial one-take recording map from a video title.

## Local Setup

```bash
npm install
npm run dev
```

Create `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

Open `http://localhost:3000`.

## Vercel Deployment

1. Import this `solution-step-extractor` folder as the Vercel project root.
2. Add `OPENAI_API_KEY` in Vercel Project Settings -> Environment Variables.
3. Deploy.

The in-detail researcher prompt is hardcoded in `app/api/extract/route.ts` and is never sent from the client.

## Output Sections

- App / Tool Name
- The Goal
- Preparation, including free vs premium/subscription notes
- In-Detail Step-By-Step, with a copy button
- The One-Take Warnings
