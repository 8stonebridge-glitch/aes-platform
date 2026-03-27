# Inbox Page

Page template for a notification or message inbox.

## What It Provides

- Inbox list with unread/read styling
- Filter tabs (All, Unread, Actionable)
- Mark as read/unread actions
- Bulk selection and bulk actions
- Detail preview panel (split view)
- Empty inbox state

## States Handled

- Loading (skeleton list)
- Empty (no messages)
- Empty filtered (no messages matching filter)
- Error (fetch failure)
- Populated (normal state)
- Selected (detail panel open)

## What Builder Fills

- Message/notification type definitions
- Action definitions per message type
- Detail panel content renderer per type
- Convex query and mutation bindings
- Badge count integration
- Notification preference links
