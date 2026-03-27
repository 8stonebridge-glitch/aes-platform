# Wizard Flow

Page template for a multi-step form or onboarding flow.

## What It Provides

- Step indicator with progress bar
- Step navigation (next, back, skip where allowed)
- Per-step validation before advancing
- Summary/review step before submission
- XState integration for step state machine

## States Handled

- Loading (prefilling data)
- Step active (current step form)
- Step complete (validated, checkmark shown)
- Step skipped (optional step bypassed)
- Validation error (blocked from advancing)
- Submitting (final step, loading)
- Success (completion confirmation)
- Abandoned (unsaved warning on exit)

## What Builder Fills

- Step definitions (title, description, fields)
- Per-step Zod schemas
- Skip rules (which steps are optional)
- Summary rendering logic
- Convex mutation for final submission
- XState machine definition (states, guards, transitions)
