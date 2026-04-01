import { describe, it, expect } from "vitest";
import {
  decomposeFeature,
  composeFile,
  getTargetFiles,
  getPartsForFile,
  dependenciesSatisfied,
  type GeneratedFragment,
  type PartKind,
} from "../../src/builder/feature-parts.js";
import { retrieveVerifiedContextForPart } from "../../src/contracts/framework-contract-layer.js";
import type { BuilderPackage } from "../../src/builder-artifact.js";

function makePkg(overrides: Partial<BuilderPackage> = {}): BuilderPackage {
  return {
    package_id: "pkg-1",
    job_id: "job-1",
    bridge_id: "bridge-1",
    feature_id: "feat-1",
    feature_name: "App Settings",
    objective: "Manage application settings",
    included_capabilities: ["Settings Form", "View Settings"],
    excluded_capabilities: [],
    target_repo: "test/repo",
    allowed_write_paths: ["**/*"],
    forbidden_paths: [],
    may_create_files: true,
    may_modify_files: true,
    may_delete_files: false,
    reuse_assets: [],
    reuse_requirements: [],
    source_files: {},
    required_tests: [],
    pattern_requirements: [],
    catalog_enforcement_rules: "",
    ...overrides,
  };
}

describe("decomposeFeature", () => {
  it("decomposes a feature with form + list capabilities", () => {
    const pkg = makePkg({
      feature_name: "Ticket Board",
      included_capabilities: ["Create Ticket", "Ticket List", "Ticket Detail"],
    });

    const decomposed = decomposeFeature(pkg);

    expect(decomposed.featureSlug).toBe("ticket-board");
    expect(decomposed.tableName).toBe("ticket_board");

    // Should have parts for query, mutation, and pages
    const kinds = decomposed.parts.map((p) => p.kind);
    expect(kinds).toContain("query");
    expect(kinds).toContain("mutation");
    expect(kinds).toContain("page-shell");
    expect(kinds).toContain("auth-guard");
    expect(kinds).toContain("form-body");
    expect(kinds).toContain("submit-handler");
    expect(kinds).toContain("data-loader");
    expect(kinds).toContain("test");
  });

  it("produces separate target files for each capability", () => {
    const pkg = makePkg({
      feature_name: "Tasks",
      included_capabilities: ["Create Task", "Task History"],
    });

    const decomposed = decomposeFeature(pkg);
    const files = getTargetFiles(decomposed);

    expect(files).toContain("convex/tasks/queries.ts");
    expect(files).toContain("convex/tasks/mutations.ts");
    expect(files).toContain("app/tasks/create-task/page.tsx");
    expect(files).toContain("app/tasks/task-history/page.tsx");
    expect(files).toContain("tests/tasks/tasks.test.ts");
  });

  it("marks auth-guard and page-shell as deterministic", () => {
    const pkg = makePkg({
      included_capabilities: ["Create Form"],
    });

    const decomposed = decomposeFeature(pkg);
    const shells = decomposed.parts.filter((p) => p.kind === "page-shell");
    const guards = decomposed.parts.filter((p) => p.kind === "auth-guard");

    expect(shells.every((p) => p.deterministic)).toBe(true);
    expect(guards.every((p) => p.deterministic)).toBe(true);
  });

  it("marks query, mutation, form-body as non-deterministic (LLM)", () => {
    const pkg = makePkg({
      included_capabilities: ["Create Form"],
    });

    const decomposed = decomposeFeature(pkg);

    const query = decomposed.parts.find((p) => p.kind === "query");
    const mutation = decomposed.parts.find((p) => p.kind === "mutation");
    const formBody = decomposed.parts.find((p) => p.kind === "form-body");

    expect(query?.deterministic).toBe(false);
    expect(mutation?.deterministic).toBe(false);
    expect(formBody?.deterministic).toBe(false);
  });

  it("sets correct dependency chain for form pages", () => {
    const pkg = makePkg({
      included_capabilities: ["Submit Form"],
    });

    const decomposed = decomposeFeature(pkg);

    const shell = decomposed.parts.find((p) => p.kind === "page-shell");
    const guard = decomposed.parts.find((p) => p.kind === "auth-guard");
    const form = decomposed.parts.find((p) => p.kind === "form-body");
    const submit = decomposed.parts.find((p) => p.kind === "submit-handler");

    expect(shell?.dependsOn).toEqual([]);
    expect(guard?.dependsOn).toEqual(["page-shell"]);
    expect(form?.dependsOn).toEqual(["page-shell", "auth-guard"]);
    expect(submit?.dependsOn).toEqual(["form-body"]);
  });
});

describe("dependenciesSatisfied", () => {
  it("returns true when all deps are in completed set", () => {
    const part = {
      kind: "form-body" as PartKind,
      targetFile: "test.tsx",
      order: 2,
      prompt: "",
      deterministic: false,
      dependsOn: ["page-shell", "auth-guard"] as PartKind[],
    };

    const completed = new Set<PartKind>(["page-shell", "auth-guard"]);
    expect(dependenciesSatisfied(part, completed)).toBe(true);
  });

  it("returns false when a dep is missing", () => {
    const part = {
      kind: "form-body" as PartKind,
      targetFile: "test.tsx",
      order: 2,
      prompt: "",
      deterministic: false,
      dependsOn: ["page-shell", "auth-guard"] as PartKind[],
    };

    const completed = new Set<PartKind>(["page-shell"]);
    expect(dependenciesSatisfied(part, completed)).toBe(false);
  });

  it("returns true for parts with no dependencies", () => {
    const part = {
      kind: "query" as PartKind,
      targetFile: "test.ts",
      order: 0,
      prompt: "",
      deterministic: false,
      dependsOn: [] as PartKind[],
    };

    expect(dependenciesSatisfied(part, new Set())).toBe(true);
  });
});

describe("composeFile", () => {
  it("composes deterministic parts using preamble", () => {
    const fragments: GeneratedFragment[] = [
      {
        part: {
          kind: "page-shell",
          targetFile: "app/test/page.tsx",
          order: 0,
          prompt: "",
          preamble: '"use client";\n\nexport default function TestPage() {\n',
          deterministic: true,
          dependsOn: [],
        },
        code: "",
        success: true,
      },
      {
        part: {
          kind: "auth-guard",
          targetFile: "app/test/page.tsx",
          order: 1,
          prompt: "",
          preamble: '  const { orgId } = useAuth();\n',
          deterministic: true,
          dependsOn: ["page-shell"],
        },
        code: "",
        success: true,
      },
    ];

    const result = composeFile("app/test/page.tsx", fragments);
    expect(result).toContain('"use client"');
    expect(result).toContain("export default function TestPage");
    expect(result).toContain("useAuth");
  });

  it("skips failed fragments", () => {
    const fragments: GeneratedFragment[] = [
      {
        part: {
          kind: "page-shell",
          targetFile: "app/test/page.tsx",
          order: 0,
          prompt: "",
          preamble: "// shell",
          deterministic: true,
          dependsOn: [],
        },
        code: "",
        success: true,
      },
      {
        part: {
          kind: "form-body",
          targetFile: "app/test/page.tsx",
          order: 2,
          prompt: "generate form",
          deterministic: false,
          dependsOn: [],
        },
        code: "",
        success: false,
        error: "LLM unavailable",
      },
    ];

    const result = composeFile("app/test/page.tsx", fragments);
    expect(result).toContain("// shell");
    expect(result).not.toContain("generate form");
  });

  it("ignores fragments for other files", () => {
    const fragments: GeneratedFragment[] = [
      {
        part: {
          kind: "query",
          targetFile: "convex/test/queries.ts",
          order: 0,
          prompt: "",
          preamble: "// queries",
          deterministic: true,
          dependsOn: [],
        },
        code: "",
        success: true,
      },
    ];

    const result = composeFile("app/test/page.tsx", fragments);
    expect(result).toBe("");
  });

  it("composes LLM fragments with their preamble", () => {
    const fragments: GeneratedFragment[] = [
      {
        part: {
          kind: "query",
          targetFile: "convex/test/queries.ts",
          order: 0,
          prompt: "generate queries",
          preamble: 'import { query } from "../_generated/server";\nimport { v } from "convex/values";\n\n',
          deterministic: false,
          dependsOn: [],
        },
        code: 'export const list = query({ args: {}, returns: v.array(v.string()), handler: async () => [] });',
        success: true,
      },
    ];

    const result = composeFile("convex/test/queries.ts", fragments);
    expect(result).toContain("import { query }");
    expect(result).toContain("export const list");
  });
});

describe("getPartsForFile", () => {
  it("returns parts sorted by order", () => {
    const pkg = makePkg({
      included_capabilities: ["Create Form"],
    });

    const decomposed = decomposeFeature(pkg);
    const formPageFile = getTargetFiles(decomposed).find((f) => f.includes("create-form"));

    if (formPageFile) {
      const parts = getPartsForFile(decomposed, formPageFile);
      for (let i = 1; i < parts.length; i++) {
        expect(parts[i].order).toBeGreaterThanOrEqual(parts[i - 1].order);
      }
    }
  });
});

describe("retrieveVerifiedContextForPart", () => {
  it("returns verified pattern and hard rules for query parts", () => {
    const ctx = retrieveVerifiedContextForPart("query");
    expect(ctx).toContain("RETRIEVED GROUND TRUTH");
    expect(ctx).toContain("VERIFIED PATTERN");
    expect(ctx).toContain("HARD RULES");
    expect(ctx).toContain("returns:");
  });

  it("returns verified pattern for mutation parts", () => {
    const ctx = retrieveVerifiedContextForPart("mutation");
    expect(ctx).toContain("RETRIEVED GROUND TRUTH");
    expect(ctx).toContain("returns:");
  });

  it("returns auth patterns for auth-guard parts", () => {
    const ctx = retrieveVerifiedContextForPart("auth-guard");
    expect(ctx).toContain("RETRIEVED GROUND TRUTH");
    expect(ctx).toContain("orgId");
  });

  it("returns test patterns for test parts", () => {
    const ctx = retrieveVerifiedContextForPart("test");
    expect(ctx).toContain("RETRIEVED GROUND TRUTH");
    expect(ctx).toContain("vi.mock");
  });

  it("returns empty string for validation (no relevant packs)", () => {
    const ctx = retrieveVerifiedContextForPart("validation");
    expect(ctx).toBe("");
  });

  it("returns query + auth patterns for data-loader parts", () => {
    const ctx = retrieveVerifiedContextForPart("data-loader");
    expect(ctx).toContain("RETRIEVED GROUND TRUTH");
    // Should have content from both convex/query-core and clerk/client-auth
    expect(ctx).toContain("HARD RULES");
  });
});
