# AES v12 Platform

LangGraph.js orchestrator for the Artifact Execution System (AES) v12.

This repo contains the graph-based orchestration layer that drives the AES supervised build workflow: intent classification, spec decomposition, promotion gates, builder dispatch, validation, fix-trail recording, and deployment.

## Structure

- `src/state.ts` - LangGraph state shape (annotation-based)
- `src/graph.ts` - Main graph definition wiring all nodes
- `src/nodes/` - Individual graph node implementations
- `src/services/` - External service integrations (Neo4j, Postgres, GitHub, Vercel, Convex, Clerk)
- `src/policies/` - Retry, escalation, confidence, and routing policies

## Development

```bash
npm install
npm run build
```
