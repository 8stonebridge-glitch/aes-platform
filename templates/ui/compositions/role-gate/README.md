# Role Gate

Composition template for role-based access control on UI sections.

## What It Provides

- Wrapper component that conditionally renders children based on user role
- Forbidden fallback (permission denied message)
- Hidden mode (silently hide content) vs blocked mode (show denied state)
- Role loading state handling
- Composable with Clerk org roles

## States Handled

- Loading (role not yet resolved)
- Authorized (content rendered)
- Forbidden (fallback displayed or content hidden)
- Error (role resolution failed)

## What Builder Fills

- Required roles per gate instance
- Fallback component or message
- Mode selection (hidden vs blocked)
- Custom role resolution logic (if beyond Clerk defaults)
- Redirect route for forbidden state (optional)
