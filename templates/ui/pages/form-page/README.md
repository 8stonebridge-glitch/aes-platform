# Form Page

Page template for a standalone form (create or edit entity).

## What It Provides

- React Hook Form + Zod validation wiring
- Section-grouped field layout
- Submit/cancel action bar (sticky on scroll)
- Unsaved changes warning on navigation
- Server error display (field-level and form-level)
- Success redirect after submission

## States Handled

- Loading (prefilling edit form)
- Clean (no changes)
- Dirty (unsaved changes)
- Submitting (loading indicator, disabled controls)
- Validation error (field-level messages)
- Server error (form-level banner)
- Success (redirect or confirmation)

## What Builder Fills

- Field definitions (name, type, label, placeholder, rules)
- Section grouping and ordering
- Zod schema definition
- Convex mutation function binding
- Success redirect target
- Conditional field visibility rules
