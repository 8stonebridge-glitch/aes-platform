# Approval Bar

Composition template for an approve/reject action bar on review items.

## What It Provides

- Approve and reject buttons with confirmation dialogs
- Comment/reason input (required on reject, optional on approve)
- Status indicator (pending, approved, rejected)
- Keyboard shortcuts for power users
- Undo window after action

## States Handled

- Pending (action buttons visible)
- Confirming approve (dialog open)
- Confirming reject (dialog open with reason field)
- Submitting (loading, buttons disabled)
- Approved (success state, buttons hidden)
- Rejected (rejected state, buttons hidden)
- Error (submission failed, retry available)

## What Builder Fills

- Convex mutation bindings (approve, reject)
- Required/optional fields per action
- Confirmation dialog copy
- Post-action navigation or next-item logic
- Permission check (who can approve/reject)
