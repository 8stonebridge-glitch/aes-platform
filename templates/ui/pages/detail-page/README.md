# Detail Page

Page template for viewing and editing a single entity record.

## What It Provides

- Header with title, status badge, and action buttons
- Tabbed content area
- Metadata sidebar (created, updated, owner)
- Activity/audit log tab
- Back navigation and breadcrumb integration

## States Handled

- Loading (skeleton)
- Not found (404 with navigation hint)
- Error (fetch failure with retry)
- Populated (normal state)
- Editing (inline edit mode)
- Deleting (confirmation dialog)

## What Builder Fills

- Entity field layout per tab
- Status badge definitions and color mapping
- Action button definitions (edit, delete, archive, etc.)
- Tab definitions and content per tab
- Related entity sections
- Permission checks per action
