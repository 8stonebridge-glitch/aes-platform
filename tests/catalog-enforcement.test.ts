import { describe, it, expect } from "vitest";
import { validateCatalogUsage } from "../src/validators/catalog-usage-validator.js";
import { resolveReuseRequirements } from "../src/nodes/bridge-compiler.js";

describe("Catalog Usage Validator", () => {
  const defaultRequirements = [
    { package: "@aes/ui", components: ["Button", "Input", "Card", "Badge"] },
    { package: "@aes/layouts", components: ["SidebarLayout"] },
  ];

  it("FAIL: file with raw <button> and no @aes/ui import", () => {
    const files = [
      {
        path: "app/feature/page.tsx",
        content: `
          export default function Page() {
            return <button onClick={handleClick}>Click me</button>;
          }
        `,
      },
    ];

    const result = validateCatalogUsage(files, defaultRequirements);
    expect(result.verdict).toBe("FAIL");
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.some(v => v.violation.includes("<button>"))).toBe(true);
    expect(result.stats.raw_elements_found).toBeGreaterThan(0);
  });

  it("PASS: file with @aes/ui Button import and no raw <button>", () => {
    const files = [
      {
        path: "app/feature/page.tsx",
        content: `
          import { Button, Card } from "@aes/ui";
          import { SidebarLayout } from "@aes/layouts";

          export default function Page() {
            return (
              <SidebarLayout>
                <Card>
                  <Button onClick={handleClick}>Click me</Button>
                </Card>
              </SidebarLayout>
            );
          }
        `,
      },
    ];

    const result = validateCatalogUsage(files, defaultRequirements);
    expect(result.verdict).toBe("PASS");
    expect(result.violations.length).toBe(0);
    expect(result.stats.aes_imports_found).toBe(1);
  });

  it("FAIL: file with both raw <button> AND @aes/ui import", () => {
    const files = [
      {
        path: "app/feature/page.tsx",
        content: `
          import { Button } from "@aes/ui";
          import { SidebarLayout } from "@aes/layouts";

          export default function Page() {
            return (
              <div>
                <Button onClick={handleA}>Good</Button>
                <button onClick={handleB}>Bad</button>
              </div>
            );
          }
        `,
      },
    ];

    const result = validateCatalogUsage(files, defaultRequirements);
    expect(result.verdict).toBe("FAIL");
    const buttonViolation = result.violations.find(v => v.violation.includes("<button>"));
    expect(buttonViolation).toBeDefined();
    expect(result.stats.aes_imports_found).toBe(1);
    expect(result.stats.raw_elements_found).toBeGreaterThan(0);
  });

  it("FAIL: missing required package import", () => {
    const files = [
      {
        path: "app/feature/page.tsx",
        content: `
          import { Button } from "@aes/ui";

          export default function Page() {
            return <Button>Click</Button>;
          }
        `,
      },
    ];

    // Require both @aes/ui and @aes/layouts
    const result = validateCatalogUsage(files, defaultRequirements);
    expect(result.verdict).toBe("FAIL");
    const missingPkg = result.violations.find(v =>
      v.violation.includes("@aes/layouts")
    );
    expect(missingPkg).toBeDefined();
    expect(missingPkg!.severity).toBe("error");
  });

  it("PASS: all required packages imported, no raw elements", () => {
    const files = [
      {
        path: "app/feature/page.tsx",
        content: `
          import { Button, Input, Card, Badge } from "@aes/ui";
          import { SidebarLayout } from "@aes/layouts";

          export default function Page() {
            return (
              <SidebarLayout>
                <Card>
                  <Badge>Active</Badge>
                  <Input placeholder="Search..." />
                  <Button>Submit</Button>
                </Card>
              </SidebarLayout>
            );
          }
        `,
      },
    ];

    const result = validateCatalogUsage(files, defaultRequirements);
    expect(result.verdict).toBe("PASS");
    expect(result.violations.length).toBe(0);
    expect(result.stats.files_checked).toBe(1);
    expect(result.stats.aes_imports_found).toBe(1);
  });

  it("SKIP: non-TSX file with <button> is not checked", () => {
    const files = [
      {
        path: "lib/utils.ts",
        content: `
          // This is a utility that mentions <button> in a comment
          export const buttonClass = "bg-primary";
        `,
      },
    ];

    const result = validateCatalogUsage(files, defaultRequirements);
    // No TSX files to check, so no violations from patterns
    expect(result.stats.files_checked).toBe(0);
    expect(result.violations.length).toBe(0);
  });

  it("SKIP: file in node_modules is not checked", () => {
    const files = [
      {
        path: "node_modules/@some/lib/component.tsx",
        content: `
          export function Component() {
            return <button>Raw button in dep</button>;
          }
        `,
      },
    ];

    const result = validateCatalogUsage(files, defaultRequirements);
    expect(result.stats.files_checked).toBe(0);
    expect(result.violations.filter(v => v.violation.includes("<button>")).length).toBe(0);
  });
});

describe("resolveReuseRequirements", () => {
  it("always includes @aes/ui and @aes/layouts", () => {
    const feature = { name: "Dashboard" };
    const reqs = resolveReuseRequirements(feature);

    const uiReq = reqs.find(r => r.package === "@aes/ui");
    const layoutReq = reqs.find(r => r.package === "@aes/layouts");

    expect(uiReq).toBeDefined();
    expect(layoutReq).toBeDefined();
    expect(uiReq!.components).toContain("Button");
    expect(uiReq!.components).toContain("LoadingState");
    expect(layoutReq!.components).toContain("SidebarLayout");
  });

  it("adds Table for queue/list features", () => {
    const feature = { name: "Approval Queue" };
    const reqs = resolveReuseRequirements(feature);

    const uiReq = reqs.find(r => r.package === "@aes/ui");
    expect(uiReq!.components).toContain("Table");
  });

  it("adds Badge for status features", () => {
    const feature = { name: "Status Overview" };
    const reqs = resolveReuseRequirements(feature);

    const uiReq = reqs.find(r => r.package === "@aes/ui");
    expect(uiReq!.components).toContain("Badge");
  });

  it("adds Input and Dialog for form features", () => {
    const feature = { name: "Create Request Form" };
    const reqs = resolveReuseRequirements(feature);

    const uiReq = reqs.find(r => r.package === "@aes/ui");
    expect(uiReq!.components).toContain("Input");
    expect(uiReq!.components).toContain("Dialog");
  });

  it("deduplicates components across multiple matches", () => {
    const feature = { name: "Request Form with Status Review" };
    const reqs = resolveReuseRequirements(feature);

    // Should have only one @aes/ui entry (deduplicated)
    const uiReqs = reqs.filter(r => r.package === "@aes/ui");
    expect(uiReqs.length).toBe(1);

    // But it should contain all matched components
    const uiReq = uiReqs[0];
    expect(uiReq.components).toContain("Badge");
    expect(uiReq.components).toContain("Input");
    expect(uiReq.components).toContain("Dialog");
    expect(uiReq.components).toContain("Toast");
  });
});

describe("Catalog Validator — multiple forbidden patterns", () => {
  it("detects raw <input>, <textarea>, <table>, <select>", () => {
    const files = [
      {
        path: "app/feature/form.tsx",
        content: `
          import { SidebarLayout } from "@aes/layouts";

          export default function FormPage() {
            return (
              <div>
                <input type="text" />
                <textarea rows={4} />
                <select>
                  <option>A</option>
                </select>
                <table>
                  <tr><td>Data</td></tr>
                </table>
              </div>
            );
          }
        `,
      },
    ];

    const result = validateCatalogUsage(files, [
      { package: "@aes/layouts", components: ["SidebarLayout"] },
    ]);

    expect(result.verdict).toBe("FAIL");

    const inputViolation = result.violations.find(v => v.violation.includes("<input>"));
    const textareaViolation = result.violations.find(v => v.violation.includes("<textarea>"));
    const selectViolation = result.violations.find(v => v.violation.includes("<select>"));
    const tableViolation = result.violations.find(v => v.violation.includes("<table>"));

    expect(inputViolation).toBeDefined();
    expect(textareaViolation).toBeDefined();
    expect(selectViolation).toBeDefined();
    expect(tableViolation).toBeDefined();
  });

  it("detects animate-pulse as a warning", () => {
    const files = [
      {
        path: "app/feature/loading.tsx",
        content: `
          import { Card } from "@aes/ui";
          import { SidebarLayout } from "@aes/layouts";

          export default function Loading() {
            return <div className="animate-pulse h-12 bg-muted rounded" />;
          }
        `,
      },
    ];

    const result = validateCatalogUsage(files, [
      { package: "@aes/ui", components: ["Card"] },
      { package: "@aes/layouts", components: ["SidebarLayout"] },
    ]);

    // animate-pulse is a warning, not error — so verdict should be PASS
    expect(result.verdict).toBe("PASS");
    const pulseViolation = result.violations.find(v => v.violation.includes("loading spinner"));
    expect(pulseViolation).toBeDefined();
    expect(pulseViolation!.severity).toBe("warning");
  });
});
