export const CANARY_DEFINITIONS = {
    "shoutout-board": {
        slug: "shoutout-board",
        title: "Team Shoutout Board",
        description: "A team recognition app where org members can post shoutouts to colleagues. Features: create/list shoutouts by org, Clerk auth for user identity, org-scoped queries with withIndex, real-time list view.",
        exercisedPacks: [
            "convex/query-core",
            "convex/mutation-core",
            "convex/schema-core",
            "clerk/client-auth",
            "clerk/middleware",
        ],
    },
    "inventory-tool": {
        slug: "inventory-tool",
        title: "Inventory Tracker",
        description: "An inventory management tool with categories, items, and stock levels. Features: schema with typed ID relations between categories and items, withIndex access for filtered views, CRUD mutations, status badges.",
        exercisedPacks: [
            "convex/query-core",
            "convex/mutation-core",
            "convex/schema-core",
            "clerk/client-auth",
            "clerk/server-auth",
            "clerk/middleware",
        ],
    },
    "ticket-portal": {
        slug: "ticket-portal",
        title: "Support Ticket Portal",
        description: "A customer support ticket system with middleware-protected routes and server-side auth. Features: clerkMiddleware for route protection, server-side auth() in API routes, action handlers for ticket assignment, status transitions with audit trail.",
        exercisedPacks: [
            "convex/query-core",
            "convex/mutation-core",
            "convex/schema-core",
            "clerk/client-auth",
            "clerk/server-auth",
            "clerk/middleware",
        ],
    },
};
