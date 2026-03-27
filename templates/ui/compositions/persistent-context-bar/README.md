# Persistent Context Bar

Composition template for a sticky bar showing active context information.

## What It Provides

- Sticky bar (top or bottom) showing current context
- Context info: selected org, active role, environment indicator
- Quick switch controls (org, role, environment)
- Dismissable alerts and banners
- Badge indicators for pending actions

## States Handled

- Normal (context displayed)
- Alert active (banner visible)
- Switching (org/role change in progress)
- Collapsed (minimal mode)

## What Builder Fills

- Context fields to display (org name, role, environment)
- Switch actions and available options
- Alert/banner content and trigger conditions
- Badge count queries
- Styling per environment (production warning, staging indicator)
