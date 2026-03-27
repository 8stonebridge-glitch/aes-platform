# Profile Page

Page template for viewing and editing a user or entity profile.

## What It Provides

- Profile header with avatar, name, and role
- Editable bio/description section
- Contact information section
- Activity summary section
- Edit mode toggle

## States Handled

- Loading (skeleton profile)
- Not found (user does not exist)
- Error (fetch failure)
- View mode (read-only)
- Edit mode (inline editing active)
- Saving (update in progress)
- Own profile vs other user's profile

## What Builder Fills

- Profile field definitions
- Avatar upload integration
- Activity query binding
- Permission rules (who can edit what)
- Convex mutation for profile updates
- Related entity links (teams, projects, etc.)
