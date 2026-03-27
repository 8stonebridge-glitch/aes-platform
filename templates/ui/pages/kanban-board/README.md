# Kanban Board

Page template for a drag-and-drop kanban-style board.

## What It Provides

- Column-based layout with drag-and-drop
- Card component with configurable fields
- Add card inline form
- Column header with count badge
- Drag handle and drop zone indicators

## States Handled

- Loading (skeleton columns and cards)
- Empty (no cards in any column)
- Empty column (specific column has no cards)
- Error (fetch failure)
- Dragging (visual drag feedback)
- Dropping (optimistic update with rollback)

## What Builder Fills

- Column definitions (which status values map to columns)
- Card field layout (title, subtitle, badges, avatar)
- Card detail route or modal
- Convex mutation for status change on drop
- Filter and search bindings
- Permission check for drag actions
