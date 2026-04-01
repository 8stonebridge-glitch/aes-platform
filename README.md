# AES v12 Platform

LangGraph.js orchestrator for the Artifact Execution System (AES) v12.

This repo contains the graph-based orchestration layer that drives the AES supervised build workflow: intent classification, spec decomposition, promotion gates, builder dispatch, validation, fix-trail recording, and deployment.

## Structure

- `src/state.ts` - LangGraph state shape (annotation-based)
- `src/graph.ts` - Main graph definition wiring all nodes
- `src/nodes/` - Individual graph node implementations
- `src/services/` - External service integrations (Neo4j, Postgres, GitHub, Vercel, Convex, Clerk)
- `src/policies/` - Retry, escalation, confidence, and routing policies

## Configuration

Copy `.env.example` to `.env` and set your values:

```bash
cp .env.example .env
```

- `AES_POSTGRES_URL` — Required for persistent artifact storage and replay. Without it, the platform runs in memory-only mode (artifacts are lost on restart).
- `AES_NEO4J_URL` / `AES_NEO4J_USER` / `AES_NEO4J_PASSWORD` — Optional. Neo4j knowledge graph integration (not yet wired).
- `AES_API_KEY` — Optional. If set, required for all API calls (Bearer or `x-api-key`).
- `AES_CONVEX_SITE_URL` — Optional. Pushes job status to Convex UI.

## Development

```bash
npm install
npm run build
```

## API surface (relevant endpoints)

- `POST /api/build` — start a build
- `GET /api/jobs/:id/stream` — SSE stream
- `GET /api/jobs/:id` — job status
- `GET /api/jobs/:id/logs` — job logs
- `GET /api/jobs/:id/features` — feature list with bridges
- `GET /api/jobs/:id/audit` — full audit trail
- `POST /api/jobs/:id/confirm` — confirm intent (if paused)
- `POST /api/jobs/:id/approve` — approve plan (if paused)
- `GET /api/canary` — list canaries
- `POST /api/canary/:slug/run` — trigger canary build
- `GET /api/canary/:slug/results` — canary success rate
- `GET /api/jobs/:id/checkpoints` — list checkpoints (resume metadata)
- `GET /api/jobs/:id/checkpoints/latest` — latest checkpoint
- `POST /api/jobs/:id/resume/compile` — rerun compile gate from the latest checkpoint (fails with 410 if the workspace path no longer exists)

### Checkpoint / resume notes

- Checkpoints are stored in Postgres (`job_checkpoints`) and mirrored in-memory for local runs.
- Compile gate records checkpoints at start, on failure, and on success.
- Resume currently targets the compile gate only. It reuses the saved workspace; if the directory is gone (e.g., tmp GC on Railway), the API returns 410 with the missing path.
- Invalidation scope is recorded on failures (`["compile_gate"]` today); extend as you add other gates.
