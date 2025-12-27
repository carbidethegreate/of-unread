# OnlyFans Unread Messages Dashboard

Single-page dashboard for **Parker Martin** that fetches unread chats (last 10 days), pulls the most recent 24 messages per chat for context, generates draft replies with OpenAI `gpt-4o`, and sends replies in bulk.

## Deployed URL

- https://of-unread.onrender.com

## Tech

- Node.js + Express + TypeScript (server)
- React + Vite (client)
- Docker multi-stage build
- Designed for Render Starter (0.5 CPU, 512MB RAM)

## Environment Variables

Copy `.env.example` to `.env` locally and fill in values. **Do not log or expose secrets.**

Required for core functionality:

- `ONLYFANS_ACCOUNT_ID`
- `ONLYFANS_API_KEY`
- `OPENAI_API_KEY`

Optional / present in your Render environment (kept for completeness):

- `CF_IMAGES_ACCOUNT_HASH`, `CF_IMAGES_ACCOUNT_ID`, `CF_IMAGES_TOKEN`, `Cloudflare_Global_API_Key`
- `DATABASE_URL`, `DATABASE_URL_OLD`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`, `DB_USER`
- `GITHUB_API_KEY`, `LIST_ID`

## Local Dev

```bash
npm install
cp .env.example .env
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3000

## Production Build

```bash
npm install
npm run build
PORT=3000 npm start
```

## Render

Render should build from the Dockerfile. The service must bind to the `PORT` env var.

Start command (Docker): `npm start`

Health check: `/healthz`

## API Endpoints (Server)

- `GET /api/unread?days=10`
- `POST /api/draft`
- `POST /api/send`

## OnlyFansAPI.com Base URL and Auth

This app calls OnlyFansAPI.com endpoints at `https://app.onlyfansapi.com/api/...` and authenticates with:

- `Authorization: Bearer {ONLYFANS_API_KEY}` citeturn0search1turn0search5

## PPV / media limitation

This iteration supports **text-only** sends. If the OnlyFans API requires media to send a paid (PPV) message, the server returns a validation error and the UI explains that media upload is not included in this build.

## Security notes

- Secrets are server-side only.
- Centralized error handling with redacted logs.
- Basic IP rate limiting on `/api/*`.

