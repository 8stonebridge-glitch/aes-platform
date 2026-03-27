# Timeline Page

Page template for displaying chronological event history.

## What It Provides

- Vertical timeline with event nodes
- Event type icons and color coding
- Expandable event detail sections
- Date grouping (by day, week, month)
- Infinite scroll or pagination

## States Handled

- Loading (skeleton timeline)
- Empty (no events yet)
- Error (fetch failure)
- Populated (normal state)
- Loading more (pagination indicator)
- Expanded (event detail open)

## What Builder Fills

- Event type definitions (icon, color, label)
- Event detail content renderer per type
- Convex query for event data
- Date grouping strategy
- Filter definitions (event type, date range, actor)
