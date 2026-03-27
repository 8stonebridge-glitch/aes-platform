# Settings Page

Page template for application or account settings.

## What It Provides

- Left sidebar navigation for setting categories
- Form sections per category
- Save/reset per section
- Danger zone section (delete account, etc.)
- Toggle and select controls pre-wired

## States Handled

- Loading (fetching current settings)
- Clean (no changes)
- Dirty (unsaved changes with save prompt)
- Saving (per-section loading indicator)
- Error (save failure with retry)
- Success (toast confirmation)

## What Builder Fills

- Setting categories and their fields
- Default values and validation rules
- Danger zone actions and confirmation copy
- Permission checks (which roles see which sections)
- Convex mutation bindings per section
