# aes-templates

Starter app and UI template repository for AES v12.

## Overview

This repository contains **6 app templates** and **26 UI templates** that serve as the foundation for AES-driven application builds. Each template defines what the framework provides out of the box and what the builder is responsible for filling in.

All templates target the standard AES stack: **Next.js + Convex + Clerk + Vercel + XState**.

## App Templates (6)

Full application starter templates with `template.yaml` metadata, baseline features, and builder contracts.

| Template | App Class | Description |
|----------|-----------|-------------|
| `admin-console` | `internal_ops_tool` | Back-office admin panel for users, resources, and audit logs |
| `internal-ops-pwa` | `internal_ops_pwa` | Mobile-first PWA for field teams with offline support |
| `customer-portal` | `customer_portal` | Self-service portal for external customers |
| `workflow-approval` | `workflow_approval_system` | Multi-step request and approval workflows |
| `marketplace-lite` | `marketplace` | Two-sided marketplace for listing and transacting |
| `fintech-wallet` | `fintech_wallet` | Financial services app with transfers and audit trails |

Each app template includes:
- `template.yaml` with id, app class, stack, baseline features, optional features, fixed-in-template items, left-for-builder items, best donors, and promotion tier
- `README.md` with a description of the template's purpose and capabilities

## UI Templates (26)

Reusable UI building blocks organized into three categories.

### Pages (13)

| Template | Purpose |
|----------|---------|
| `dashboard-overview` | Dashboard home with stat cards, activity feed, quick actions |
| `data-table-page` | Full-page data table with server-side operations |
| `detail-page` | Single entity view with tabs and metadata |
| `form-page` | Standalone create/edit form |
| `settings-page` | Application or account settings |
| `inbox-page` | Notification or message inbox |
| `kanban-board` | Drag-and-drop kanban board |
| `timeline-page` | Chronological event history |
| `wizard-flow` | Multi-step form or onboarding flow |
| `search-results` | Search results with filters |
| `profile-page` | User or entity profile |
| `error-page` | Error states (404, 500, 403) |
| `empty-state` | Zero-data and first-time states |

### Layouts (5)

| Template | Purpose |
|----------|---------|
| `sidebar-layout` | Persistent left sidebar navigation |
| `top-nav-layout` | Horizontal top navigation bar |
| `split-layout` | Two-panel side-by-side view |
| `marketing-layout` | Public-facing marketing pages |
| `auth-layout` | Authentication pages (sign in, sign up) |

### Compositions (8)

| Template | Purpose |
|----------|---------|
| `stat-card-row` | Row of metric/stat cards with trends |
| `activity-feed` | Chronological activity event list |
| `approval-bar` | Approve/reject action bar |
| `file-attachment-list` | File upload and attachment management |
| `comment-thread` | Threaded comment section |
| `breadcrumb-nav` | Auto-generated breadcrumb navigation |
| `persistent-context-bar` | Sticky context bar (org, role, environment) |
| `role-gate` | Role-based access control wrapper |

## Template Contract

Every UI template README documents three sections:

1. **What It Provides** -- what the template gives you out of the box
2. **States Handled** -- loading, empty, error, populated, and domain-specific states
3. **What Builder Fills** -- what the AES builder must supply (queries, field definitions, permissions, etc.)

Every app template `template.yaml` documents:

- **fixed_in_template** -- infrastructure the template handles (auth wiring, app shell, form framework, etc.)
- **left_for_builder** -- domain-specific work the builder must implement
- **baseline_features** -- features included in the default build
- **optional_features** -- features available but not included by default
- **best_donors** -- reference products for design and behavior patterns

## Promotion Tier

All templates are at `DERIVED` promotion tier. They must pass AES promotion gates before entering the canonical execution layer.
