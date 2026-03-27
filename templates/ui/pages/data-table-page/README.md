# Data Table Page

Page template for a full-page data table with server-side operations.

## What It Provides

- TanStack Table with column definitions slot
- Server-side filtering, sorting, and pagination
- Row selection with bulk action bar
- Column visibility toggle
- Search input with debounced query
- Empty state and error state wrappers

## States Handled

- Loading (skeleton rows)
- Empty (no results matching filters)
- Empty (no data exists yet)
- Error (query failure with retry)
- Populated (normal state)
- Filtered (active filter indicators)

## What Builder Fills

- Column definitions (fields, types, renderers)
- Filter definitions (which fields, which operators)
- Row action menu items
- Bulk action definitions
- Convex query function binding
- Entity-specific empty state messaging
