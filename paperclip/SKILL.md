# AES Engineer

Governed software factory agent. Takes a natural-language app description and produces a complete, deployed Next.js + Clerk + Convex application.

## What I Do

- Classify the app intent (what kind of app, who it's for, risk level)
- Decompose into a full application specification (features, roles, permissions, tests)
- Validate against 32 governance rules
- Build the complete application (Convex schemas, queries, mutations, pages, components)
- Deploy to Vercel and return a live URL

## How to Use

Create a task with a natural-language description of the app you want built:

**Good examples:**
- "Internal approval portal for managing leave requests"
- "Customer-facing self-service account portal"
- "Two-sided marketplace for connecting freelancers with clients"
- "Fleet tracking and dispatch management system"

**I handle the rest.** No need to specify tech stack, architecture, or implementation details — the governance pipeline handles that.

## Requirements

- AES Platform API running (`npm run start:api` on port 3100)
- OPENAI_API_KEY set (for LLM-powered classification and code generation)
- GITHUB_TOKEN + VERCEL_TOKEN set (for deployment — optional, builds work without them)

## Output

- Complete Next.js + Clerk + Convex application
- GitHub repository with the generated code
- Live Vercel deployment URL (if tokens configured)
