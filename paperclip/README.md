# AES + Paperclip Integration

Run the AES governed software factory as a Paperclip agent.

## Prerequisites

1. [Paperclip](https://paperclip.ing) installed and running
2. AES Platform built (`npm run build`)
3. Environment variables set:
   - `OPENAI_API_KEY` — for LLM-powered pipeline
   - `GITHUB_TOKEN` — for pushing generated apps (optional)
   - `VERCEL_TOKEN` — for deploying to Vercel (optional)

## Setup

### 1. Start the AES API

```bash
cd aes-platform
npm run start:api
```

The API starts on port 3100 (configurable via `AES_PORT`).

### 2. Configure the agent in Paperclip

1. Open your Paperclip dashboard
2. Go to **Agents → Hire Agent**
3. Choose adapter type: **Process**
4. Configure:
   - **Name**: `aes-engineer`
   - **Role**: `engineer`
   - **Command**: `npx tsx paperclip/aes-agent.ts`
   - **Working directory**: `/path/to/aes-platform`
   - **Environment variables**:
     - `AES_API_URL=http://localhost:3100`
5. Set heartbeat: **On task assignment** (not scheduled)
6. Set budget as desired

### 3. Create a task

Create a new task in Paperclip and assign it to the AES Engineer:

> "Build an internal approval portal for managing leave requests"

The agent will:
1. Read the task description from Paperclip's API
2. Send it to AES as a build intent (`POST /api/build`)
3. Stream progress via SSE (`GET /api/jobs/:id/stream`)
4. Auto-confirm the intent classification and auto-approve the app plan
5. Post the deployment URL as a comment on the task when done

## Standalone Testing

You can test the adapter without Paperclip:

```bash
# Via npm script
npm run paperclip -- "internal approval portal for leave requests"

# Or directly
npx tsx paperclip/aes-agent.ts "internal approval portal for leave requests"
```

This runs the adapter directly, passing the intent as a command-line argument.

## How It Works

The adapter script (`paperclip/aes-agent.ts`) implements Paperclip's process adapter protocol:

1. **Paperclip sets environment variables** — `PAPERCLIP_TASK_ID`, `PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY`, etc.
2. **Script fetches task content** — Calls Paperclip's API to get the task description
3. **Starts AES build** — `POST /api/build` with the task content as the intent
4. **Streams progress** — Subscribes to the SSE stream at `GET /api/jobs/:id/stream`
5. **Handles governance gates**:
   - **Intent confirmation** (`needs_confirmation` event) — Auto-confirms since the task description is already the confirmed intent
   - **Plan approval** (`needs_approval` event) — Auto-approves the generated app plan
6. **Reports result** — Prints progress to stdout (captured by Paperclip) and posts a comment to the task with the deployment URL

### AES API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/build` | Start a new build with an intent string |
| `GET` | `/api/jobs/:id/stream` | SSE stream for real-time progress events |
| `POST` | `/api/jobs/:id/confirm` | Confirm intent classification |
| `POST` | `/api/jobs/:id/approve` | Approve the generated app plan |
| `GET` | `/api/jobs/:id` | Get job status (includes deployment URL) |

### SSE Event Types

| Event | Description |
|-------|-------------|
| `connected` | Stream connected |
| `gate` | Pipeline entering a new governance gate |
| `step` | Progress step within a gate |
| `success` | Successful sub-step |
| `fail` | Failed sub-step |
| `warn` | Warning (non-fatal) |
| `pause` | Pipeline paused |
| `feature` | Feature build status update |
| `needs_confirmation` | Intent needs user confirmation (auto-confirmed) |
| `needs_approval` | App plan needs approval (auto-approved) |
| `complete` | Build finished |
| `error` | Build failed |

## Architecture

```
┌──────────────┐     env vars      ┌──────────────────┐     HTTP/SSE     ┌──────────────┐
│  Paperclip   │ ─────────────────▶│  aes-agent.ts    │ ───────────────▶│  AES API     │
│  (scheduler) │                   │  (process adapter)│                 │  (port 3100) │
└──────────────┘                   └──────────────────┘                 └──────────────┘
       │                                   │                                   │
       │  reads task description           │  POST /api/build                  │
       │  captures stdout                  │  GET /api/jobs/:id/stream         │
       │  checks exit code                 │  POST /api/jobs/:id/confirm       │
       │                                   │  POST /api/jobs/:id/approve       │
       │                                   │  GET /api/jobs/:id                │
       │◀──────────────────────────────────│                                   │
       │  exit 0 + stdout log              │◀──────────────────────────────────│
       │                                   │  SSE events + job status          │
```
