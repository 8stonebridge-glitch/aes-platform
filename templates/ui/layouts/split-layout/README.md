# Split Layout

Layout template with a two-panel side-by-side view.

## What It Provides

- Left panel (list or navigation)
- Right panel (detail or content)
- Resizable divider
- Mobile: stacked panels with back navigation
- Panel collapse/expand controls

## States Handled

- Both panels visible (desktop)
- Left panel focused (mobile, list view)
- Right panel focused (mobile, detail view)
- Left panel collapsed (maximized right)
- Empty right panel (no selection)

## What Builder Fills

- Left panel content component
- Right panel content component
- Default panel width ratio
- Selection state management
- Empty selection placeholder content
