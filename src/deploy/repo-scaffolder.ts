import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface RepoConfig {
  app_name: string;
  app_slug: string; // kebab-case
  org_id?: string;
}

/**
 * Scaffolds a real Next.js + Clerk + Convex project in a workspace.
 * This produces an actually buildable/deployable project, not stubs.
 */
export class RepoScaffolder {

  scaffold(workspacePath: string, config: RepoConfig): void {
    // 1. package.json
    this.writePackageJson(workspacePath, config);

    // 2. tsconfig.json
    this.writeTsConfig(workspacePath);

    // 3. next.config.mjs
    this.writeNextConfig(workspacePath);

    // 4. next-env.d.ts
    this.writeNextEnv(workspacePath);

    // 5. tailwind.config.ts
    this.writeTailwindConfig(workspacePath);

    // 6. postcss.config.mjs
    this.writePostcssConfig(workspacePath);

    // 7. .env.local.example + actual .env.local with provider URLs
    this.writeEnvExample(workspacePath);
    this.writeEnvLocal(workspacePath);

    // 8. Convex project structure
    this.writeConvexBase(workspacePath);

    // 9. Clerk middleware
    this.writeClerkMiddleware(workspacePath);

    // 10. App layout with Clerk + Convex providers
    this.writeAppLayout(workspacePath, config);

    // 11. Home page
    this.writeHomePage(workspacePath, config);

    // 12. Global CSS
    this.writeGlobalCss(workspacePath);

    // 13. Vitest config + test setup
    this.writeVitestConfig(workspacePath);
    this.writeTestSetup(workspacePath);

    // 14. Local AES UI compatibility layer for standalone deploys
    this.writeAesUiCompat(workspacePath);

    // 15. .gitignore
    this.writeGitignore(workspacePath);

    // 16. AES workspace metadata
    this.writeAesConfig(workspacePath, config);
  }

  private ensureDir(filePath: string) {
    const parts = filePath.split("/");
    parts.pop();
    const dir = parts.join("/");
    if (dir) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private writePackageJson(base: string, config: RepoConfig) {
    writeFileSync(join(base, "package.json"), JSON.stringify({
      name: config.app_slug,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "next lint",
        test: "vitest run",
      },
      dependencies: {
        "next": "^15.0.0",
        "react": "^19.0.0",
        "react-dom": "^19.0.0",
        "@clerk/nextjs": "^6.0.0",
        "convex": "^1.17.0",
        "convex-helpers": "^0.1.0",
        "lucide-react": "^0.441.0",
      },
      devDependencies: {
        "typescript": "^5.7.0",
        "@types/node": "^22.0.0",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@testing-library/dom": "^10.4.0",
        "@testing-library/jest-dom": "^6.6.3",
        "@testing-library/react": "^16.2.0",
        "tailwindcss": "^3.4.0",
        "postcss": "^8.4.0",
        "autoprefixer": "^10.4.0",
        "jsdom": "^25.0.1",
        "vitest": "^2.0.0",
      },
    }, null, 2) + "\n");
  }

  private writeTsConfig(base: string) {
    writeFileSync(join(base, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        types: ["node", "react", "react-dom", "vitest/globals", "@testing-library/jest-dom"],
        plugins: [{ name: "next" }],
        paths: {
          "@/*": ["./*"],
          "@aes/ui": ["./components/aes-ui/index"],
          "@aes/ui/*": ["./components/aes-ui/*"],
        },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    }, null, 2) + "\n");
  }

  private writeNextConfig(base: string) {
    writeFileSync(join(base, "next.config.mjs"), `/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
`);
  }

  private writeNextEnv(base: string) {
    writeFileSync(join(base, "next-env.d.ts"), `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited manually.
`);
  }

  private writeTailwindConfig(base: string) {
    writeFileSync(join(base, "tailwind.config.ts"), `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: { extend: {} },
  plugins: [],
};
export default config;
`);
  }

  private writePostcssConfig(base: string) {
    writeFileSync(join(base, "postcss.config.mjs"), `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
export default config;
`);
  }

  private writeEnvExample(base: string) {
    writeFileSync(join(base, ".env.local.example"), `# Clerk (OPTIONAL — keyless mode works without these)
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
# CLERK_SECRET_KEY=sk_test_...

# Convex
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
CONVEX_DEPLOYMENT=dev:your-project
`);
  }

  private writeEnvLocal(base: string) {
    const lines: string[] = [];

    // Clerk publishable key
    const clerkKey = process.env.AES_CLERK_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (clerkKey) {
      lines.push(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${clerkKey}`);
    }

    // Clerk secret key
    const clerkSecret = process.env.AES_CLERK_SECRET_KEY
      || process.env.CLERK_SECRET_KEY;
    if (clerkSecret) {
      lines.push(`CLERK_SECRET_KEY=${clerkSecret}`);
    }

    // Convex URL
    const convexUrl = process.env.AES_CONVEX_URL
      || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (convexUrl) {
      lines.push(`NEXT_PUBLIC_CONVEX_URL=${convexUrl}`);
    }

    if (lines.length > 0) {
      writeFileSync(join(base, ".env.local"), lines.join("\n") + "\n");
    }
  }

  private writeVitestConfig(base: string) {
    writeFileSync(join(base, "vitest.config.ts"), `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
`);
  }

  private writeTestSetup(base: string) {
    mkdirSync(join(base, "tests"), { recursive: true });
    writeFileSync(join(base, "tests", "setup.ts"), `import "@testing-library/jest-dom/vitest";
`);
  }

  private writeConvexBase(base: string) {
    mkdirSync(join(base, "convex"), { recursive: true });
    mkdirSync(join(base, "convex", "_generated"), { recursive: true });

    // convex/schema.ts - base schema with audit log
    writeFileSync(join(base, "convex", "schema.ts"), `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Base schema for ${base.split("/").pop()}
 * Generated by AES v12
 *
 * All tables include orgId for tenant isolation.
 * Add feature-specific tables below the base tables.
 */
const schema = defineSchema({
  // Audit log - tracks all significant actions
  audit_logs: defineTable({
    action: v.string(),
    resource: v.string(),
    resourceId: v.string(),
    actorId: v.string(),
    orgId: v.string(),
    metadata: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_resource", ["resource", "resourceId"])
    .index("by_actor", ["actorId"]),
});

export default schema;
`);

    writeFileSync(join(base, "convex", "_generated", "api.ts"), `/**
 * Minimal AES-generated Convex API stub.
 * Replaced by real Convex codegen in deployed environments that run \`npx convex dev\` or \`npx convex codegen\`.
 */
export const api = new Proxy({}, {
  get(_target, feature: string | symbol) {
    return new Proxy({}, {
      get(_nestedTarget, fn: string | symbol) {
        return \`\${String(feature)}:\${String(fn)}\`;
      },
    });
  },
}) as any;
`);

    writeFileSync(join(base, "convex", "_generated", "dataModel.ts"), `export type Id<TableName extends string = string> = string & { __tableName?: TableName };
`);

    writeFileSync(join(base, "convex", "_generated", "server.ts"), `type ConvexHandlerDefinition = {
  args?: Record<string, unknown>;
  handler: (...args: any[]) => any;
  [key: string]: unknown;
};

export function query<T extends ConvexHandlerDefinition>(definition: T): T {
  return definition;
}

export function mutation<T extends ConvexHandlerDefinition>(definition: T): T {
  return definition;
}
`);

    // convex/tsconfig.json
    writeFileSync(join(base, "convex", "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        lib: ["ES2021", "dom"],
        module: "ESNext",
        moduleResolution: "Bundler",
        allowJs: true,
        strict: true,
        noEmit: true,
        isolatedModules: true,
        skipLibCheck: true,
        paths: { "convex/_generated/*": ["./_generated/*"] },
      },
      include: ["./**/*.ts", "./**/*.tsx"],
      exclude: ["./node_modules"],
    }, null, 2) + "\n");

    // convex/audit.ts - audit log mutation
    writeFileSync(join(base, "convex", "audit.ts"), `import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Log an audit event. Called by all mutations that modify data.
 */
export const log = mutation({
  args: {
    action: v.string(),
    resource: v.string(),
    resourceId: v.string(),
    actorId: v.string(),
    orgId: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("audit_logs", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

/**
 * List audit logs for an org, most recent first.
 */
export const list = query({
  args: {
    orgId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("audit_logs")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .order("desc")
      .take(args.limit || 50);
    return logs;
  },
});
`);
  }

  private writeClerkMiddleware(base: string) {
    writeFileSync(join(base, "proxy.ts"), `import { clerkMiddleware } from '@clerk/nextjs/server'
export default clerkMiddleware()
export const config = {
  matcher: [
    '/((?!_next|[^?]*\\\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
`);
  }

  private writeAppLayout(base: string, config: RepoConfig) {
    mkdirSync(join(base, "app"), { recursive: true });

    writeFileSync(join(base, "app", "layout.tsx"), `import type { Metadata } from "next";
import { ClerkProvider, SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { ConvexClientProvider } from "./convex-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "${config.app_name}",
  description: "Built by AES v12 — Governed Software Factory",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <ConvexClientProvider>
            <header className="flex justify-between items-center px-6 py-3 border-b">
              <span className="font-semibold">${config.app_name}</span>
              <div className="flex items-center gap-3">
                <Show when="signed-out">
                  <SignInButton />
                  <SignUpButton />
                </Show>
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </div>
            </header>
            <main>{children}</main>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
`);

    // Convex provider — works with keyless Clerk too
    writeFileSync(join(base, "app", "convex-provider.tsx"), `"use client";

import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!convex) {
    // No Convex URL yet — render children without Convex
    return <>{children}</>;
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
`);
  }

  private writeHomePage(base: string, config: RepoConfig) {
    writeFileSync(join(base, "app", "page.tsx"), `import { auth } from "@clerk/nextjs/server";

export default async function HomePage() {
  const { userId } = await auth();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">${config.app_name}</h1>
      <p className="text-gray-500 mb-8">Built by AES v12</p>

      {userId ? (
        <a
          href="/dashboard"
          className="bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800"
        >
          Go to Dashboard
        </a>
      ) : (
        <p className="text-gray-400">Sign in to get started</p>
      )}
    </main>
  );
}
`);
  }

  private writeGlobalCss(base: string) {
    writeFileSync(join(base, "app", "globals.css"), `@tailwind base;
@tailwind components;
@tailwind utilities;
`);
  }

  private writeAesUiCompat(base: string) {
    mkdirSync(join(base, "components", "aes-ui"), { recursive: true });
    writeFileSync(
      join(base, "components", "aes-ui", "index.tsx"),
      `"use client";

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  ElementType,
  HTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  TextareaHTMLAttributes,
  ThHTMLAttributes,
  InputHTMLAttributes,
} from "react";
import React, { forwardRef } from "react";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};
type ButtonProps = (ButtonHTMLAttributes<HTMLButtonElement> | ButtonLinkProps) & {
  className?: string;
};
export function Button({ className, ...props }: ButtonProps) {
  const baseClassName = cx(
    "inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
    className,
  );

  if ("href" in props && typeof props.href === "string") {
    const { href, ...anchorProps } = props;
    return (
      <a href={href} className={baseClassName} {...anchorProps} />
    );
  }

  const { type = "button", ...buttonProps } = props as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      type={type as ButtonHTMLAttributes<HTMLButtonElement>["type"]}
      className={baseClassName}
      {...buttonProps}
    />
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement>;
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cx(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cx(
        "min-h-[120px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cx(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;
export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cx("mb-2 block text-sm font-medium text-slate-700", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";

type CardProps<T extends ElementType = "div"> = {
  as?: T;
  children?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Card<T extends ElementType = "div">({
  as,
  className,
  children,
  ...props
}: CardProps<T>) {
  const Component = (as || "div") as ElementType;
  return (
    <Component
      className={cx(
        "block rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("border-b border-slate-100 px-5 py-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("px-5 py-4", className)} {...props}>
      {children}
    </div>
  );
}

export function Badge({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function LoadingState({
  className,
  children = "Loading...",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500", className)} {...props}>
      {children}
    </div>
  );
}

export function EmptyState({
  className,
  children = "Nothing here yet.",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500", className)} {...props}>
      {children}
    </div>
  );
}

export function ErrorState({
  className,
  children = "Something went wrong.",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700", className)} {...props}>
      {children}
    </div>
  );
}

export function Toast({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg", className)} {...props}>
      {children}
    </div>
  );
}

export function Dialog({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-2xl border border-slate-200 bg-white p-5 shadow-xl", className)} {...props}>
      {children}
    </div>
  );
}

export function Table({
  className,
  children,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cx("min-w-full border-collapse text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cx("border-b border-slate-200 text-left text-slate-500", className)} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cx("divide-y divide-slate-100", className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cx("hover:bg-slate-50", className)} {...props}>
      {children}
    </tr>
  );
}

export function TableCell({
  className,
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx("px-4 py-3 text-slate-700", className)} {...props}>
      {children}
    </td>
  );
}

export function TableHead({
  className,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cx("px-4 py-3 text-xs font-semibold uppercase tracking-wide", className)} {...props}>
      {children}
    </th>
  );
}
`,
    );
  }

  private writeGitignore(base: string) {
    writeFileSync(join(base, ".gitignore"), `node_modules/
.next/
dist/
.env.local
.env
*.tsbuildinfo
.vercel
`);
  }

  private writeAesConfig(base: string, config: RepoConfig) {
    mkdirSync(join(base, ".github"), { recursive: true });
    writeFileSync(join(base, ".github", "aes-instructions.md"), `# AES Build Instructions

This repo is managed by AES v12.

## Stack
- Next.js (App Router)
- Convex (backend + database)
- Clerk (auth + orgs)
- Tailwind CSS
- Vercel (deploy)

## Conventions
- All Convex queries filter by orgId
- All mutations call audit.log
- All routes under /app are protected by Clerk middleware
- Feature code lives under app/<feature-slug>/
- Convex functions live under convex/<feature-slug>/
- Components live under components/<feature-slug>/
- Tests live under tests/<feature-slug>/

## App: ${config.app_name}
`);
  }
}
