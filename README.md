# OnlyFans Unread Messages Dashboard (Parker Martin)

Single-page dashboard that pulls unread OnlyFans chat messages from the last N days, generates draft replies using OpenAI GPT-4o, and sends replies back through OnlyFansAPI.com.

## What this app does

- Fetch unread chats from OnlyFansAPI.com and loads the latest 24 messages for context
- Lets you request a draft reply (OpenAI GPT-4o) per unread message
- Lets you edit the draft and send it back
- Optional follow-up: add the fan to one or more predefined OnlyFans user lists before sending
- Includes a global "Send to All" action that sends prepared drafts with a gentle client-side rate limit

## Tech stack

- Node.js + Express
- TypeScript
- Single-page UI served from `public/` (vanilla JS). A copy of the UI source is also included in `src/client/`.
- Docker (multi-stage build)
- Designed to run on Render Starter plan (512MB RAM)

## Endpoints

- `GET /api/unread?days=10`
- `POST /api/draft`
- `POST /api/send`
- `GET /api/config` (safe, non-secret config for the UI)
- `GET /healthz`

## OnlyFansAPI.com endpoints used

This app calls these OnlyFansAPI.com endpoints server-side:

- List Chats: `GET /api/{account}/chats` (uses `filter=unread`, `order=recent`, `limit`, `offset`, `skip_users`)  
  Docs: https://docs.onlyfansapi.com/api-reference/chats/list-chats

- List Chat Messages: `GET /api/{account}/chats/{chat_id}/messages` (uses `limit=24`, `order=desc`, `skip_users=all`)  
  Docs: https://docs.onlyfansapi.com/api-reference/chat-messages/list-chat-messages

- Send Message: `POST /api/{account}/chats/{chat_id}/messages`  
  Docs: https://docs.onlyfansapi.com/api-reference/chat-messages/send-message

- Typing Indicator (best effort): `POST /api/{account}/chats/{chat_id}/typing`  
  Docs: https://docs.onlyfansapi.com/api-reference/chats/start-typing-indicator

- Add Users to User List: `POST /api/{account}/user-lists/{userListId}/users` with body `{ "ids": [123] }`  
  Docs: https://docs.onlyfansapi.com/api-reference/user-list-collections/add-users-to-user-list

## PPV / paid messages limitation

OnlyFansAPI.com documentation indicates that when `price` is not `0`, `mediaFiles` is required on Send Message. This MVP does not implement media upload or vault selection, so it blocks paid sends and instructs you to leave PPV Price blank for free messages.

Docs: https://docs.onlyfansapi.com/api-reference/chat-messages/send-message

## OpenAI usage

The server uses the Chat Completions API with model `gpt-4o`.

- Chat Completions API: https://platform.openai.com/docs/api-reference/chat
- GPT-4o model: https://platform.openai.com/docs/models/gpt-4o

## Environment variables

Copy `.env.example` to `.env` for local development and set:

- `ONLYFANS_ACCOUNT_ID` (Parker Martin: `acct_6c513bcfe14346399f6bf0f5a0bffafb`)
- `ONLYFANS_API_KEY`
- `OPENAI_API_KEY`

All other variables listed in `.env.example` are included for completeness but are not required by this app.

Important:

- Secrets are never sent to the browser
- The app never logs environment variable values

## Local development

```bash
npm install
cp .env.example .env
# edit .env with your keys
npm run dev
# open http://localhost:3000
```

Tip: For fully reproducible builds, commit the generated `package-lock.json` after running `npm install`.

## Docker

```bash
docker build -t of-unread .
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e ONLYFANS_ACCOUNT_ID=acct_6c513bcfe14346399f6bf0f5a0bffafb \
  -e ONLYFANS_API_KEY=... \
  -e OPENAI_API_KEY=... \
  of-unread
```

## Render.com deployment notes

- Create a new Render Web Service
- Choose Environment: Docker
- Render sets `PORT` automatically; the server binds to `process.env.PORT`
- Set the environment variables in Render:
  - `ONLYFANS_ACCOUNT_ID`
  - `ONLYFANS_API_KEY`
  - `OPENAI_API_KEY`

Render start command (if you need it):

```bash
node dist/server/server.js
```

## Predefined user lists

These user-list IDs are shown as checkboxes:

- `1250617614` PPV Request
- `1250618083` Custom Request
- `1250618262` Live Chat

## Security and operational notes

- Rate limiting is applied to `/api/*`
- OpenAI draft generation is limited more aggressively than read-only routes
- Central error handling avoids leaking secrets
