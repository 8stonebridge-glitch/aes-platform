# @aes/rules

Validation and policy rules for AES v12.

## Gates

| Gate | Purpose | Rules |
|------|---------|-------|
| Gate 0 | Intent disambiguation | 6 rules |
| Gate 1 | AppSpec validation | 10 rules |
| Gate 2 | Bridge compile checks | 10 rules |
| Gate 3 | Hard veto evaluation | 11 veto codes |
| Gate 4 | Catalog admission | 10-check admission checklist |
| Gate 5 | FixTrail recording | 10 rules |

## Policies

- **Veto Registry** - 11 hard veto codes with trigger conditions and remediation guidance
- **Confidence Thresholds** - Minimum confidence scores per gate
- **Validator Routing** - Tiered validator selection based on feature properties and risk
- **Catalog Admission** - Checklist-based admission decision logic
- **Escalation Policy** - Per-gate escalation and self-repair limits
- **App Class Routing** - Template and validator emphasis by application class (11 classes)

## Usage

```typescript
import { evaluateGate1, evaluateGate3, resolveValidators } from "@aes/rules";

const specResult = evaluateGate1(appSpec);
const vetoResult = evaluateGate3(vetoContext);
const validators = resolveValidators(featureProps, "build");
```
