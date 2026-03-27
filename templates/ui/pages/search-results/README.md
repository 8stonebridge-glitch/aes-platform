# Search Results

Page template for displaying search results with filters.

## What It Provides

- Search input with query param sync
- Faceted filter sidebar
- Result list with configurable card layout
- Result count and sort controls
- Pagination or infinite scroll

## States Handled

- Loading (skeleton results)
- Empty (no results found)
- Error (search failure)
- Populated (normal results)
- Filtered (active filter badges)
- Loading more (pagination indicator)

## What Builder Fills

- Result card layout (which fields to display)
- Filter definitions (facets, ranges, toggles)
- Sort options (relevance, date, name, etc.)
- Convex search query binding
- Result click action (navigate to detail)
- Suggested searches for empty state
