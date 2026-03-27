# Stat Card Row

Composition template for a row of metric/stat cards.

## What It Provides

- Responsive row of stat cards (1-4 per row)
- Each card: label, value, trend indicator (up/down/neutral), icon
- Skeleton loading state per card
- Click-through to detail route

## States Handled

- Loading (skeleton cards)
- Error (individual card error badge)
- Populated (normal display)

## What Builder Fills

- Card definitions (label, query, format, icon, trend logic, route)
- Number formatting (currency, percentage, count)
- Trend calculation logic
- Convex query bindings per card
