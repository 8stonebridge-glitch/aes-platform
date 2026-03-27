# @aes/contracts

Canonical typed contracts for the AES v12 governed software factory.

## Schemas

| File | Gate | Purpose |
|------|------|---------|
| `enums.ts` | All | Shared enumerations across all contracts |
| `intent-brief.ts` | Gate 0 | Intent disambiguation — what app do you mean? |
| `app-spec.ts` | Gate 1 | Decomposition — what does the app contain? |
| `feature-bridge.ts` | Gate 2 | Bridge — what exactly should this builder do? |
| `hard-veto.ts` | Gate 3 | Hard vetoes — what must stop immediately? |
| `catalog-admission.ts` | Gate 4 | Catalog admission — what is safe to reuse globally? |
| `fix-trail.ts` | Gate 5 | FixTrail — what failed and how do we learn? |
| `gate-rules.ts` | 1 & 2 | Validation rules for AppSpec and Bridge |
| `state-machines.ts` | All | App Plan and Bridge state machine transitions |

## Build

```bash
npm install
npm run build
```
