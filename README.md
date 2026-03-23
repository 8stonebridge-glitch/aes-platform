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

## Development

```bash
npm install
npm run build
```
