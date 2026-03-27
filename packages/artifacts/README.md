# @aes/artifacts

Postgres artifact store for AES v12 — immutable build evidence and decision records.

## Overview

This package provides the persistence layer for the AES (Automated Execution System) pipeline. Every decision, build result, validation outcome, and deployment record is stored as an immutable artifact with full lineage tracking.

## Tables (10)

| Table | Gate | Purpose |
|---|---|---|
| `intent_briefs` | Gate 0 | Raw user requests with inferred classifications |
| `app_specs` | Gate 1 | Typed application specifications with confidence scores |
| `feature_bridges` | Gate 2 | Feature-level build contracts linking specs to implementation |
| `veto_results` | Gate 3 | Hard-veto evaluation results (auth, permissions, data ownership) |
| `validator_results` | — | Tiered validation evidence (tier_a, tier_b, tier_c) |
| `catalog_admissions` | Gate 4 | Shared catalog admission decisions for reusable assets |
| `fix_trails` | Gate 5 | Failure-to-resolution records with pattern matching |
| `deployments` | — | Deployment records (preview, production) with rollback tracking |
| `build_runs` | — | Builder execution records with PR and file-change tracking |
| `user_approvals` | — | User confirmation and approval decisions |

## Immutability Model

All artifact tables are append-only at the application layer. No UPDATE or DELETE operations are performed on core artifact data. New versions of specs and bridges reference their parent via `parent_id`, forming a version chain.

The only mutable fields are operational status columns on `build_runs` and `deployments` (status transitions like pending -> executing -> passed) and `fix_trails.resolved_at`.

## Versioning

`app_specs` and `feature_bridges` support versioning through:
- `parent_id` — references the previous version
- `version` — incrementing integer

This allows full audit trails of how specs evolved over time.

## Usage

```typescript
import { PgClient, ArtifactWriteService, ArtifactReadService } from "@aes/artifacts";

const db = new PgClient({ connectionString: process.env.DATABASE_URL });
const writer = new ArtifactWriteService(db);
const reader = new ArtifactReadService(db);

// Record an intent brief
const brief = await writer.recordIntentBrief({
  request_id: "...",
  raw_request: "Build a task management app",
  inferred_app_class: "productivity",
  // ...
});

// Query full lineage
const lineage = await reader.getRequestLineage(requestId);
```

## Schema Migration

Apply the initial schema:

```bash
psql $DATABASE_URL -f src/schema/migrations/001-initial-schema.sql
```

## Architecture

```
src/
  schema/
    migrations/001-initial-schema.sql   # Postgres DDL
    types.ts                             # TypeScript interfaces for all tables
  repositories/                          # Per-table typed CRUD
    intent-brief-repo.ts
    app-spec-repo.ts
    feature-bridge-repo.ts
    veto-result-repo.ts
    validator-result-repo.ts
    catalog-admission-repo.ts
    fix-trail-repo.ts
    deployment-repo.ts
    build-run-repo.ts
    approval-repo.ts
  services/
    pg-client.ts                         # Pool wrapper with transaction support
    artifact-write-service.ts            # Coordinated write operations
    artifact-read-service.ts             # Cross-table reads and lineage queries
  index.ts                               # Public API exports
```
