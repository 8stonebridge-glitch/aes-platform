# Dashboard Overview

Page template for a dashboard home screen.

## What It Provides

- Stat card row (metrics with trend indicators)
- Recent activity feed
- Quick actions grid
- Welcome/greeting header

## States Handled

- Loading (skeleton)
- Empty (first-time user)
- Error (data fetch failure)
- Populated (normal state)

## What Builder Fills

- Stat card definitions (which metrics to show)
- Activity feed query (which Convex table to query)
- Quick action definitions (which actions, which routes)
- Greeting personalization logic
