# @aes/math

Numeric governance layer for the AES (Artifact Execution System). Every LLM output, every promotion decision, every build gate passes through deterministic math. No bypass.

## What It Does

This package provides the math substrate that enforces governance across the entire AES pipeline:

- **Confidence Engine** - Computes composite confidence from 6 weighted dimensions (evidence coverage, dependency completeness, pattern match quality, test coverage, freshness, contradiction penalty). Thresholds gate promotion, bridge approval, and auto-approve decisions.

- **Veto Engine** - 19 binary hard vetoes. If any fires, promotion is blocked. No score can override a veto. Covers auth, role boundaries, tenancy, destructive actions, payments, stale bridges, missing dependencies, scope violations, and more.

- **Dependency Engine** - Analyzes dependency graphs: topological sort for build order, circular dependency detection, impact radius per node, critical path identification, missing prerequisite detection.

- **Scope Drift Engine** - Compares approved scope against actual changes. Detects path violations, forbidden paths, unauthorized file creation/deletion, schema changes, budget overruns. Produces a drift score.

- **Priority Engine** - Ranks build candidates by business value, readiness, evidence strength, effort (inverted), and blast radius (inverted). Blocked items sink to the bottom.

- **State Machine** - Formal artifact lifecycle with 12 states and prerequisite-gated transitions. Each transition requires specific confidence levels, validator results, veto clearance, and human approval where needed.

- **Bridge Enricher** - Attaches all math fields to a bridge document in one call, running confidence and veto engines together.

- **6 Deterministic Validators** - Structure, dependency integrity, scope compliance, interface coverage, rule compliance, test mapping. Each is pure computation with typed input/output.

- **Score Recorder** - Persistence-ready evaluation records for every math evaluation, designed for Postgres and Neo4j integration.

## Install

```bash
npm install @aes/math
```

## Usage

```typescript
import {
  computeConfidence,
  evaluateVetoes,
  analyzeDependencies,
  analyzeScopeDrift,
  rankPriorities,
  canTransition,
  runAllValidators,
  enrichBridgeWithMath,
  ScoreRecorder,
} from "@aes/math";
```

## Build

```bash
npm run build   # tsc
npm test        # vitest
```

## Architecture

All engines are pure functions. No side effects, no LLM calls, no network access. Input goes in, deterministic output comes out. The math layer sits between the LLM planning layer and the execution layer, ensuring nothing proceeds without passing numeric gates.

## License

MIT
