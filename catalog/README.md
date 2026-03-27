# AES v12 Reusable Asset Catalog

This repository is the central catalog registry for AES (Artifact Execution System) v12. It contains YAML catalog entries that agents search before writing new code, ensuring reuse of vetted components, modules, workflows, patterns, and templates.

## Structure

```
packages/     # UI primitives, auth modules, layouts, workflows, and services
patterns/     # Reusable design and architecture patterns
templates/    # Full application templates composing packages and patterns
```

## How it works

Each `.yaml` file describes a reusable asset with its ID, type, dependencies, test status, tags, and promotion tier. AES agents query this catalog during the planning phase to identify existing assets that satisfy feature requirements before generating new code.

## Catalog entry schema

| Field                  | Description                                      |
|------------------------|--------------------------------------------------|
| `id`                   | Unique asset identifier                          |
| `name`                 | Human-readable name                              |
| `description`          | What the asset does and when to use it           |
| `type`                 | component, module, workflow, pattern, or template |
| `repo`                 | Source repository (aes-packages or aes-templates) |
| `package_path`         | Path within the source repo                      |
| `branch_or_tag`        | Git ref to resolve                               |
| `owning_team`          | Team responsible for the asset                   |
| `dependencies`         | List of catalog IDs this asset depends on        |
| `tests`                | Test suite name, last run timestamp, and status  |
| `usage_constraints`    | Required environment variables or prerequisites  |
| `last_validation_date` | When the asset was last validated                |
| `tags`                 | Searchable tags for agent discovery              |
| `promotion_tier`       | AES promotion tier (DERIVED, CANONICAL, etc.)    |
| `donor_lineage`        | Traceability to donor assets                     |

## Coverage

- **8 UI primitives**: button, input, table, dialog, toast, badge, card, tabs
- **3 auth modules**: core auth, role guard, org switcher
- **5 layout templates**: dashboard shell, data table page, detail page, form page, settings page, sidebar layout
- **2 workflow engines**: approval workflow, status workflow
- **4 service modules**: audit trail, notifications, Stripe payments, Paystack payments
- **2 composite packages**: inbox pattern, file upload zone
- **6 patterns**: persistent context bar, approval state machine, transaction list, dashboard overview, multi-step wizard, role-gated navigation
- **6 application templates**: admin console, internal ops PWA, customer portal, workflow approval, marketplace lite, fintech wallet
