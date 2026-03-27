# Comment Thread

Composition template for a threaded comment section.

## What It Provides

- Comment list with avatar, author, timestamp, and body
- Reply input with rich text (optional)
- Nested replies (one level)
- Edit and delete actions on own comments
- Real-time updates via Convex subscriptions

## States Handled

- Loading (skeleton comments)
- Empty (no comments, prompt to start)
- Error (fetch failure)
- Populated (normal thread)
- Submitting (new comment in progress)
- Editing (inline edit active)
- Deleting (confirmation dialog)

## What Builder Fills

- Convex query and mutation bindings
- Rich text support (on/off)
- Max nesting depth
- Mention support and user search integration
- Permission rules (who can edit/delete)
- Notification trigger on new comment
