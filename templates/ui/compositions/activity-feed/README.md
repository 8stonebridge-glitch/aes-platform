# Activity Feed

Composition template for a chronological list of recent activity events.

## What It Provides

- Event list with avatar, actor, action text, and timestamp
- Event type icon and color coding
- Relative time display ("2 hours ago")
- Load more / infinite scroll
- Real-time update support via Convex subscriptions

## States Handled

- Loading (skeleton list)
- Empty (no recent activity)
- Error (fetch failure)
- Populated (normal list)
- Loading more (pagination indicator)
- New event (highlight animation)

## What Builder Fills

- Event type definitions (icon, color, action text template)
- Convex query for event data
- Actor display logic (name, avatar)
- Click-through route per event type
- Max items and pagination strategy
