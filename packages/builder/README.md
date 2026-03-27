# @aes/builder

Builder contract and execution layer for AES v12 — the governed software factory.

## Core Principle

**The builder is BLIND to the full system.** It only sees the `FeatureBridge`.

The builder receives a `BuilderInput` derived from a single feature's bridge. It cannot see the full `AppSpec`, other features, the graph, or any system state beyond what the bridge explicitly provides.

## Contract

1. **Input**: `BuilderInput` (derived from `FeatureBridge`) — the ONLY thing the builder sees
2. **Scope enforcement**: All file writes are checked against `write_scope`. Violations are immediate hard fails. The builder cannot override this.
3. **No self-approval**: The builder produces output and a `ValidatorHandoff`. It cannot approve its own work.
4. **Repair loop**: If validators reject the output, the repair loop decides whether to retry, patch, escalate, or abort. Maximum 3 attempts.
5. **Output**: `BuilderOutput` + `ValidatorHandoff` — handed to independent validators

## Modules

| Module | Purpose |
|---|---|
| `types.ts` | `BuilderInput` and `BuilderOutput` schemas (Zod) |
| `builder-agent.ts` | Main orchestration — receives input, produces output |
| `scope-enforcer.ts` | Validates all file operations against bridge scope |
| `branch-manager.ts` | Branch naming: `aes/<job-id>/<feature-name>` |
| `commit-convention.ts` | Commit messages: `[AES] type(feature): description` |
| `pr-creator.ts` | PR body generation with bridge references |
| `repair-loop.ts` | Post-validation repair decisions |
| `validator-handoff.ts` | Format conversion for validator consumption |

## Scope Violations

Any of these = immediate hard fail:

- `write_outside_scope` — wrote to a path not in `allowed_repo_paths`
- `forbidden_path` — wrote to a path in `forbidden_repo_paths`
- `unauthorized_delete` — deleted a file when `may_delete_files` is false
- `shared_package_change` — modified shared packages when `may_change_shared_packages` is false
- `schema_change` — modified schema when `may_change_schema` is false

## Branch Convention

```
aes/<job-id>/<feature-name>
```

All PRs target `develop`.

## Commit Convention

```
[AES] feat(auth): implement login flow

Bridge: <bridge-id>
Feature: <feature-id>
Job: <job-id>
```
