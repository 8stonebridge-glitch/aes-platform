# @aes/failure-memory

Structured failure and repair memory system for AES v12.

## Overview

This package provides a typed, promotable failure memory system that captures failure patterns, fix patterns, prevention rules, and validator heuristics. It supports similarity matching against known failures, fix suggestion, and a promotion pipeline that elevates successful fixes into prevention rules and then into validator heuristics.

## Architecture

### Types

- **FailurePattern** — A recognized class of failure with type, root cause, severity, and frequency tracking.
- **FixPattern** — A known fix for one or more failure patterns, with success rate and application count.
- **PreventionRule** — A gate-time check that prevents a failure pattern before it occurs.
- **ValidatorHeuristic** — A validation-time detection rule that catches failures during build review.
- **IncidentExample** — A concrete incident linking a failure pattern to a fix and optionally to the prevention rule or heuristic it produced.

### Matching

- **findSimilarPatterns** — Scores known failure patterns against an observed failure using type, root cause, and tag similarity.
- **suggestFixes** — Given matched patterns, suggests fixes ranked by confidence (match score * fix success rate).

### Promotion Pipeline

The system supports a three-stage promotion lifecycle:

1. **Fix -> Prevention Rule** — When a fix has been applied 3+ times with 75%+ success rate, it becomes a candidate for a gate-time prevention rule.
2. **Prevention Rule -> Validator Heuristic** — When a prevention rule is linked to 2+ resolved incidents across 3+ total occurrences, it becomes a candidate for a validator-tier detection heuristic.
3. **Incident Linking** — Incidents are linked to known patterns and fixes, updating frequency counts and success rates.

### Seeds

Pre-loaded seed data:
- 25 failure patterns covering UI state, auth, tenancy, offline, deployment, workflow, and integration failures.
- 15 fix patterns with resolution templates and success metrics.
- 10 prevention rules mapped to AES gates (gate_0 through gate_5).
- 10 validator heuristics across tier_a (critical), tier_b (important), and tier_c (advisory).

## Usage

```typescript
import {
  findSimilarPatterns,
  suggestFixes,
  findPromotableFixes,
  FAILURE_PATTERN_SEEDS,
  FIX_PATTERN_SEEDS,
} from "@aes/failure-memory";

// Find patterns similar to a new failure
const matches = findSimilarPatterns(
  "permission_failure",
  "spec_gap",
  ["auth", "tenancy"],
  FAILURE_PATTERN_SEEDS
);

// Get fix suggestions
const suggestions = suggestFixes(matches, FIX_PATTERN_SEEDS);

// Check which fixes are ready to become prevention rules
const promotable = findPromotableFixes(FIX_PATTERN_SEEDS);
```

## Build

```bash
npm run build
npm run typecheck
```
