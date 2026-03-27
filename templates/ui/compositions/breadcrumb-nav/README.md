# Breadcrumb Nav

Composition template for breadcrumb navigation.

## What It Provides

- Auto-generated breadcrumb trail from route structure
- Clickable ancestor segments
- Current page (non-clickable, truncated if long)
- Mobile: collapsed with dropdown for middle segments
- Icon support for root segment

## States Handled

- Single level (home only, hidden)
- Multi-level (full breadcrumb trail)
- Overflow (collapsed middle segments on mobile)
- Loading (skeleton while route resolves)

## What Builder Fills

- Route-to-label mapping
- Custom label overrides per route
- Icon for root/home segment
- Dynamic segment label resolution (e.g., entity name from ID)
