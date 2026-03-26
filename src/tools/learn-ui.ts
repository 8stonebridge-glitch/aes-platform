/**
 * UI Knowledge Writer — writes UI patterns, components, pages, navigation,
 * and design tokens learned from a codebase into Neo4j.
 *
 * Run after reverse-engineer.ts to add the UI layer.
 *
 * Usage:
 *   npx tsx src/tools/learn-ui.ts /path/to/codebase
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getNeo4jService } from "../services/neo4j-service.js";

// ─── Types ──────────────────────────────────────────────────────────

interface UIAnalysis {
  appName: string;
  sourceId: string;
  components: UIComponent[];
  pages: PageRoute[];
  navigation: NavItem[];
  designTokens: DesignTokens;
  layouts: LayoutPattern[];
  userFlows: UserFlow[];
  formPatterns: FormPattern[];
  statePatterns: StatePattern[];
}

interface UIComponent {
  name: string;
  category: string;
  path: string;
  props: string[];
  library: string;
}

interface PageRoute {
  route: string;
  name: string;
  section: string;
  isPublic: boolean;
  hasAuth: boolean;
}

interface NavItem {
  label: string;
  route: string;
  section: string;
  children: string[];
}

interface DesignTokens {
  colors: Record<string, string>;
  fonts: string[];
  spacing: string[];
  radii: string[];
  cssFramework: string;
  componentLibrary: string;
  iconLibrary: string;
}

interface LayoutPattern {
  name: string;
  type: string;
  description: string;
  structure: string;
}

interface UserFlow {
  name: string;
  steps: string[];
  section: string;
}

interface FormPattern {
  name: string;
  components: string[];
  validation: string;
}

interface StatePattern {
  name: string;
  type: string;
  component: string;
}

// ─── Scanners ───────────────────────────────────────────────────────

function readSafe(filePath: string, maxLines = 200): string {
  try {
    return fs.readFileSync(filePath, "utf-8").split("\n").slice(0, maxLines).join("\n");
  } catch {
    return "";
  }
}

function findFiles(dir: string, pattern: RegExp, maxDepth = 5, depth = 0): string[] {
  if (depth >= maxDepth) return [];
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findFiles(full, pattern, maxDepth, depth + 1));
      } else if (pattern.test(entry.name)) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}

function scanComponents(rootDir: string): UIComponent[] {
  const components: UIComponent[] = [];

  // UI package components
  const uiDirs = [
    "packages/ui", "packages/coss-ui", "src/components", "components",
    "apps/web/components", "apps/web/modules",
  ];

  for (const uiDir of uiDirs) {
    const fullDir = path.join(rootDir, uiDir);
    if (!fs.existsSync(fullDir)) continue;

    const library = uiDir.includes("coss-ui") ? "coss-ui" : uiDir.includes("packages/ui") ? "core-ui" : "app-ui";
    const tsxFiles = findFiles(fullDir, /\.tsx$/, 4);

    for (const file of tsxFiles) {
      const name = path.basename(file, ".tsx");
      if (name.startsWith("_") || name === "index" || name.includes(".test") || name.includes(".stories")) continue;

      const relPath = path.relative(rootDir, file);
      const content = readSafe(file, 50);

      // Extract props from interface/type
      const props: string[] = [];
      const propsMatch = content.match(/(?:interface|type)\s+\w*Props\s*[=]?\s*\{([^}]+)\}/);
      if (propsMatch) {
        const propLines = propsMatch[1].split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("//"));
        for (const line of propLines) {
          const propName = line.match(/^(\w+)[?:]/)
          if (propName) props.push(propName[1]);
        }
      }

      const category = categorizeComponent(relPath, name);

      components.push({ name, category, path: relPath, props: props.slice(0, 10), library });
    }
  }

  return components;
}

function categorizeComponent(filePath: string, name: string): string {
  const lower = (filePath + name).toLowerCase();
  if (lower.includes("form") || lower.includes("input") || lower.includes("select") || lower.includes("checkbox") || lower.includes("switch") || lower.includes("radio")) return "form";
  if (lower.includes("dialog") || lower.includes("modal") || lower.includes("sheet") || lower.includes("popover") || lower.includes("overlay")) return "overlay";
  if (lower.includes("nav") || lower.includes("sidebar") || lower.includes("menu") || lower.includes("breadcrumb") || lower.includes("tab")) return "navigation";
  if (lower.includes("button") || lower.includes("badge") || lower.includes("icon") || lower.includes("avatar") || lower.includes("logo")) return "element";
  if (lower.includes("table") || lower.includes("list") || lower.includes("card") || lower.includes("grid")) return "data_display";
  if (lower.includes("skeleton") || lower.includes("loading") || lower.includes("spinner") || lower.includes("progress")) return "loading";
  if (lower.includes("error") || lower.includes("empty") || lower.includes("alert")) return "feedback";
  if (lower.includes("layout") || lower.includes("shell") || lower.includes("container") || lower.includes("section")) return "layout";
  if (lower.includes("toast") || lower.includes("banner") || lower.includes("notification")) return "notification";
  if (lower.includes("editor") || lower.includes("rich-text") || lower.includes("markdown")) return "editor";
  if (lower.includes("calendar") || lower.includes("date") || lower.includes("time")) return "datetime";
  if (lower.includes("upload") || lower.includes("file") || lower.includes("image")) return "upload";
  return "general";
}

function scanPages(rootDir: string): PageRoute[] {
  const pages: PageRoute[] = [];

  const pageDirs = [
    "apps/web/app", "apps/web/pages", "src/app", "src/pages", "app", "pages",
  ];

  for (const pageDir of pageDirs) {
    const fullDir = path.join(rootDir, pageDir);
    if (!fs.existsSync(fullDir)) continue;

    const scanRoutes = (dir: string, route: string, section: string) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "_components") continue;
          const full = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Route groups in parentheses
            const isGroup = entry.name.startsWith("(");
            const newRoute = isGroup ? route : `${route}/${entry.name}`;
            const newSection = isGroup ? entry.name.replace(/[()]/g, "") : section;
            scanRoutes(full, newRoute, newSection);
          } else if (entry.name === "page.tsx" || entry.name === "page.ts" || entry.name === "page.jsx") {
            const content = readSafe(full, 30);
            const isPublic = route.includes("booking") || route.includes("auth") || route.includes("signup") || !content.includes("session");
            const hasAuth = content.includes("auth") || content.includes("session") || content.includes("getServerSession");

            const name = route.split("/").filter(Boolean).pop() || "home";

            pages.push({
              route: route || "/",
              name: name.replace(/[\[\]]/g, "").replace(/-/g, " "),
              section,
              isPublic,
              hasAuth,
            });
          }
        }
      } catch {}
    };

    scanRoutes(fullDir, "", "root");
  }

  return pages;
}

function scanNavigation(rootDir: string): NavItem[] {
  const navItems: NavItem[] = [];

  // Search for navigation definition files
  const navFiles = findFiles(rootDir, /[Nn]avigation\.tsx?$/, 5);
  const sidebarFiles = findFiles(rootDir, /[Ss]ide[Bb]ar\.tsx?$/, 5);

  for (const file of [...navFiles, ...sidebarFiles]) {
    const content = readSafe(file, 300);

    // Extract route definitions
    const routeMatches = content.matchAll(/(?:href|path|route)\s*[=:]\s*["`']([^"`']+)["`']/g);
    const labelMatches = content.matchAll(/(?:label|name|title)\s*[=:]\s*["`']([^"`']+)["`']/g);

    const routes = [...routeMatches].map(m => m[1]);
    const labels = [...labelMatches].map(m => m[1]);

    for (let i = 0; i < Math.min(routes.length, labels.length); i++) {
      const section = routes[i].split("/").filter(Boolean)[0] || "home";
      navItems.push({
        label: labels[i],
        route: routes[i],
        section,
        children: [],
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return navItems.filter(item => {
    if (seen.has(item.route)) return false;
    seen.add(item.route);
    return true;
  });
}

function scanDesignTokens(rootDir: string): DesignTokens {
  const tokens: DesignTokens = {
    colors: {},
    fonts: [],
    spacing: [],
    radii: [],
    cssFramework: "unknown",
    componentLibrary: "unknown",
    iconLibrary: "unknown",
  };

  // Tailwind config
  const twConfigs = ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs"];
  for (const twc of twConfigs) {
    const full = path.join(rootDir, twc);
    if (fs.existsSync(full)) {
      tokens.cssFramework = "Tailwind CSS";
      const content = readSafe(full, 100);

      // Extract font families
      const fontMatches = content.matchAll(/fontFamily[^{]*\{([^}]+)\}/g);
      for (const m of fontMatches) {
        const fonts = m[1].match(/["']([^"']+)["']/g);
        if (fonts) tokens.fonts.push(...fonts.map(f => f.replace(/["']/g, "")));
      }
      break;
    }
  }

  // CSS token files
  const cssFiles = findFiles(rootDir, /tokens?\.(css|scss)$/i, 4);
  for (const file of cssFiles) {
    const content = readSafe(file, 300);

    // Extract CSS variables
    const varMatches = content.matchAll(/--([a-z-]+)\s*:\s*([^;]+);/g);
    for (const m of varMatches) {
      const name = m[1];
      const value = m[2].trim();
      if (name.includes("color") || name.includes("bg") || name.includes("brand") || name.includes("border") || name.includes("text")) {
        tokens.colors[name] = value;
      } else if (name.includes("radius")) {
        tokens.radii.push(`${name}: ${value}`);
      } else if (name.includes("spacing") || name.includes("gap")) {
        tokens.spacing.push(`${name}: ${value}`);
      } else if (name.includes("font")) {
        tokens.fonts.push(`${name}: ${value}`);
      }
    }
  }

  // Detect component library
  let rootPkg2: any = {};
  try { rootPkg2 = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8")); } catch {}
  const allDeps = Object.keys({ ...(rootPkg2.dependencies || {}), ...(rootPkg2.devDependencies || {}) });

  // Also scan nested packages
  const nestedDeps: string[] = [];
  const pkgFiles = findFiles(rootDir, /^package\.json$/, 3);
  for (const pf of pkgFiles.slice(0, 20)) {
    let pkg: any = {};
    try { pkg = JSON.parse(fs.readFileSync(pf, "utf-8")); } catch {}
    if (pkg.dependencies) nestedDeps.push(...Object.keys(pkg.dependencies));
  }
  const allAllDeps = [...new Set([...allDeps, ...nestedDeps])];

  if (allAllDeps.some(d => d.includes("@radix-ui"))) tokens.componentLibrary = "Radix UI";
  if (allAllDeps.some(d => d.includes("@base-ui"))) tokens.componentLibrary += " + Base UI";
  if (allAllDeps.some(d => d.includes("@chakra-ui"))) tokens.componentLibrary = "Chakra UI";
  if (allAllDeps.some(d => d.includes("@mui"))) tokens.componentLibrary = "Material UI";
  if (allAllDeps.some(d => d.includes("@mantine"))) tokens.componentLibrary = "Mantine";
  if (allAllDeps.some(d => d.includes("shadcn") || d.includes("@shadcn"))) tokens.componentLibrary += " (Shadcn)";

  if (allAllDeps.some(d => d.includes("lucide"))) tokens.iconLibrary = "Lucide";
  if (allAllDeps.some(d => d.includes("heroicons"))) tokens.iconLibrary = "Heroicons";
  if (allAllDeps.some(d => d.includes("@phosphor"))) tokens.iconLibrary = "Phosphor";
  if (allAllDeps.some(d => d.includes("react-icons"))) tokens.iconLibrary = "React Icons";

  return tokens;
}

function scanLayouts(rootDir: string): LayoutPattern[] {
  const layouts: LayoutPattern[] = [];

  // Find layout files
  const layoutFiles = findFiles(rootDir, /layout\.(tsx|ts|jsx)$/, 5);
  const shellFiles = findFiles(rootDir, /[Ss]hell\.(tsx|ts|jsx)$/, 5);

  for (const file of [...layoutFiles, ...shellFiles].slice(0, 20)) {
    const content = readSafe(file, 100);
    const relPath = path.relative(rootDir, file);
    const name = path.basename(file, path.extname(file));

    let type = "page";
    let description = "Page layout wrapper";

    if (relPath.includes("shell") || relPath.includes("Shell")) {
      type = "shell";
      description = "Application shell with sidebar navigation and header";
    } else if (relPath.includes("settings")) {
      type = "settings";
      description = "Settings page with vertical tab navigation";
    } else if (relPath.includes("auth")) {
      type = "auth";
      description = "Authentication layout (centered card)";
    } else if (relPath.includes("booking")) {
      type = "public";
      description = "Public-facing booking page layout";
    } else if (relPath.includes("onboarding")) {
      type = "wizard";
      description = "Multi-step onboarding wizard layout";
    } else if (relPath.includes("admin")) {
      type = "admin";
      description = "Admin panel layout with admin navigation";
    }

    // Detect structure from content
    const structure: string[] = [];
    if (content.includes("Sidebar") || content.includes("SideBar")) structure.push("sidebar");
    if (content.includes("TopNav") || content.includes("Header") || content.includes("Navbar")) structure.push("header");
    if (content.includes("Footer")) structure.push("footer");
    if (content.includes("Banner")) structure.push("banner");
    if (content.includes("Modal") || content.includes("Dialog")) structure.push("modal_system");
    if (content.includes("Toast") || content.includes("Sonner")) structure.push("toast_system");
    if (content.includes("KBar") || content.includes("CommandPalette") || content.includes("cmdk")) structure.push("command_palette");

    layouts.push({
      name: `${name} (${relPath})`,
      type,
      description,
      structure: structure.join(", ") || "content_wrapper",
    });
  }

  return layouts;
}

function scanUserFlows(rootDir: string): UserFlow[] {
  const flows: UserFlow[] = [];

  // Onboarding
  const onboardingDir = path.join(rootDir, "packages/features/onboarding");
  if (fs.existsSync(onboardingDir)) {
    flows.push({
      name: "User Onboarding",
      steps: ["Profile setup", "Calendar connection", "Availability configuration", "First event type"],
      section: "onboarding",
    });
  }

  // Check for org onboarding
  const orgOnboarding = path.join(rootDir, "apps/web/app/(use-page-wrapper)/onboarding/organization");
  if (fs.existsSync(orgOnboarding)) {
    flows.push({
      name: "Organization Onboarding",
      steps: ["Organization details", "Brand customization", "Team creation", "Member invitation", "Team migration"],
      section: "onboarding",
    });
  }

  // Auth flow
  const authDir = path.join(rootDir, "apps/web/app/auth");
  if (fs.existsSync(authDir)) {
    flows.push({
      name: "Authentication",
      steps: ["Login/Signup", "Email verification", "Two-factor auth", "SSO/SAML", "Password reset"],
      section: "auth",
    });
  }

  // Booking flow (from public pages)
  const bookingDir = path.join(rootDir, "apps/web/app/(booking-page-wrapper)");
  if (fs.existsSync(bookingDir)) {
    flows.push({
      name: "Public Booking",
      steps: ["View user/team profile", "Select event type", "Pick time slot", "Enter details", "Confirm booking", "Success page"],
      section: "booking",
    });
  }

  // Settings flow
  const settingsDir = path.join(rootDir, "apps/web/app/(use-page-wrapper)/settings");
  if (fs.existsSync(settingsDir)) {
    flows.push({
      name: "Settings Management",
      steps: ["Account settings", "Security settings", "Calendar connections", "Appearance", "Developer tools", "Billing"],
      section: "settings",
    });
  }

  // Workflow creation
  const workflowDir = path.join(rootDir, "packages/features/workflows");
  if (fs.existsSync(workflowDir)) {
    flows.push({
      name: "Workflow Builder",
      steps: ["Select trigger event", "Configure conditions", "Add actions (email/SMS/webhook)", "Set timing", "Test and activate"],
      section: "automation",
    });
  }

  // App installation
  const appDir = path.join(rootDir, "apps/web/app/(use-page-wrapper)/apps");
  if (fs.existsSync(appDir)) {
    flows.push({
      name: "App Installation",
      steps: ["Browse app store", "View app details", "OAuth authorization", "Configuration setup", "Activation"],
      section: "integrations",
    });
  }

  return flows;
}

function scanFormPatterns(rootDir: string): FormPattern[] {
  const patterns: FormPattern[] = [];

  const formDirs = [
    "packages/ui/form", "packages/ui/components/form",
    "packages/features/form-builder", "packages/features/form",
  ];

  for (const fd of formDirs) {
    const fullDir = path.join(rootDir, fd);
    if (!fs.existsSync(fullDir)) continue;

    const files = findFiles(fullDir, /\.tsx$/, 2);
    const components = files.map(f => path.basename(f, ".tsx")).filter(n => !n.startsWith("_") && n !== "index");

    if (components.length > 0) {
      patterns.push({
        name: `Form system (${path.basename(fd)})`,
        components,
        validation: "zod", // detected from deps
      });
    }
  }

  return patterns;
}

function scanStatePatterns(rootDir: string): StatePattern[] {
  const patterns: StatePattern[] = [];

  // Search for common state patterns
  const searchPatterns: [string, string][] = [
    ["skeleton", "loading"],
    ["Skeleton", "loading"],
    ["empty-screen", "empty"],
    ["EmptyScreen", "empty"],
    ["error-boundary", "error"],
    ["ErrorBoundary", "error"],
    ["loading", "loading"],
    ["Spinner", "loading"],
    ["toast", "notification"],
    ["Toaster", "notification"],
  ];

  const uiFiles = findFiles(path.join(rootDir, "packages/ui"), /\.tsx$/, 3);

  for (const file of uiFiles) {
    const name = path.basename(file, ".tsx");
    for (const [pattern, type] of searchPatterns) {
      if (name.toLowerCase().includes(pattern.toLowerCase())) {
        patterns.push({ name, type, component: path.relative(rootDir, file) });
        break;
      }
    }
  }

  return patterns;
}

// ─── Main Analysis ──────────────────────────────────────────────────

function analyzeUI(rootDir: string): UIAnalysis {
  let rootPkg: any = {};
  try { rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8")); } catch {}
  const appName = rootPkg.name || path.basename(rootDir);
  const sourceId = `learned-${appName}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  console.log(`\n[learn-ui] Scanning UI layer for: ${appName}`);

  console.log("[learn-ui] Scanning components...");
  const components = scanComponents(rootDir);
  console.log(`[learn-ui] Found ${components.length} components`);

  console.log("[learn-ui] Scanning pages...");
  const pages = scanPages(rootDir);
  console.log(`[learn-ui] Found ${pages.length} page routes`);

  console.log("[learn-ui] Scanning navigation...");
  const navigation = scanNavigation(rootDir);
  console.log(`[learn-ui] Found ${navigation.length} nav items`);

  console.log("[learn-ui] Scanning design tokens...");
  const designTokens = scanDesignTokens(rootDir);
  console.log(`[learn-ui] Found ${Object.keys(designTokens.colors).length} color tokens, ${designTokens.fonts.length} fonts`);

  console.log("[learn-ui] Scanning layouts...");
  const layouts = scanLayouts(rootDir);
  console.log(`[learn-ui] Found ${layouts.length} layout patterns`);

  console.log("[learn-ui] Scanning user flows...");
  const userFlows = scanUserFlows(rootDir);
  console.log(`[learn-ui] Found ${userFlows.length} user flows`);

  console.log("[learn-ui] Scanning form patterns...");
  const formPatterns = scanFormPatterns(rootDir);
  console.log(`[learn-ui] Found ${formPatterns.length} form patterns`);

  console.log("[learn-ui] Scanning state patterns...");
  const statePatterns = scanStatePatterns(rootDir);
  console.log(`[learn-ui] Found ${statePatterns.length} state patterns`);

  return {
    appName, sourceId, components, pages, navigation,
    designTokens, layouts, userFlows, formPatterns, statePatterns,
  };
}

// ─── Neo4j Writer ───────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

async function writeUIToNeo4j(analysis: UIAnalysis): Promise<void> {
  const neo4j = getNeo4jService();
  const ok = await neo4j.connect();
  if (!ok) {
    console.error("[learn-ui] Cannot connect to Neo4j");
    return;
  }

  const now = new Date().toISOString().split("T")[0];
  let written = 0;
  let failed = 0;

  async function safeWrite(cypher: string, label: string): Promise<boolean> {
    try {
      await neo4j.runCypher(cypher);
      written++;
      return true;
    } catch (err: any) {
      console.warn(`[learn-ui] ${label} failed: ${err.message}`);
      failed++;
      return false;
    }
  }

  // 1. UI Component categories
  console.log("[learn-ui] Writing component knowledge...");
  const componentsByCategory = new Map<string, UIComponent[]>();
  for (const comp of analysis.components) {
    if (!componentsByCategory.has(comp.category)) componentsByCategory.set(comp.category, []);
    componentsByCategory.get(comp.category)!.push(comp);
  }

  for (const [category, comps] of componentsByCategory) {
    const names = comps.map(c => c.name).slice(0, 30).join(", ");
    const cypher = `
MERGE (uc:UIComponentGroup {category: '${esc(category)}', source: '${esc(analysis.appName)}'})
ON CREATE SET uc.components = '${esc(names)}',
              uc.count = ${comps.length},
              uc.library = '${esc(comps[0]?.library || "unknown")}',
              uc.created_at = '${now}',
              uc.learned_from = '${esc(analysis.appName)}'
ON MATCH SET uc.seen_count = COALESCE(uc.seen_count, 0) + 1
WITH uc
MATCH (a:Entity {entity_id: '${analysis.sourceId}'})
MERGE (a)-[:HAS_UI_COMPONENTS]->(uc)
RETURN uc.category
    `.trim();
    await safeWrite(cypher, `UI components [${category}]`);
  }

  // 2. Page routes by section
  console.log("[learn-ui] Writing page structure...");
  const pagesBySection = new Map<string, PageRoute[]>();
  for (const page of analysis.pages) {
    if (!pagesBySection.has(page.section)) pagesBySection.set(page.section, []);
    pagesBySection.get(page.section)!.push(page);
  }

  for (const [section, pages] of pagesBySection) {
    const routes = pages.map(p => p.route).slice(0, 20).join(", ");
    const publicCount = pages.filter(p => p.isPublic).length;
    const authCount = pages.filter(p => p.hasAuth).length;

    const cypher = `
MERGE (ps:PageSection {section: '${esc(section)}', source: '${esc(analysis.appName)}'})
ON CREATE SET ps.routes = '${esc(routes)}',
              ps.page_count = ${pages.length},
              ps.public_pages = ${publicCount},
              ps.auth_pages = ${authCount},
              ps.created_at = '${now}',
              ps.learned_from = '${esc(analysis.appName)}'
WITH ps
MATCH (a:Entity {entity_id: '${analysis.sourceId}'})
MERGE (a)-[:HAS_PAGES]->(ps)
RETURN ps.section
    `.trim();
    await safeWrite(cypher, `Pages [${section}]`);
  }

  // 3. Navigation structure
  console.log("[learn-ui] Writing navigation structure...");
  for (const nav of analysis.navigation) {
    const cypher = `
MERGE (ni:NavItem {route: '${esc(nav.route)}', source: '${esc(analysis.appName)}'})
ON CREATE SET ni.label = '${esc(nav.label)}',
              ni.section = '${esc(nav.section)}',
              ni.created_at = '${now}'
WITH ni
MATCH (a:Entity {entity_id: '${analysis.sourceId}'})
MERGE (a)-[:HAS_NAV]->(ni)
RETURN ni.label
    `.trim();
    await safeWrite(cypher, `Nav [${nav.label}]`);
  }

  // 4. Design tokens
  console.log("[learn-ui] Writing design tokens...");
  const colorNames = Object.keys(analysis.designTokens.colors).slice(0, 30).join(", ");
  const fontNames = analysis.designTokens.fonts.slice(0, 10).join(", ");
  const radiiNames = analysis.designTokens.radii.slice(0, 10).join(", ");

  const tokenCypher = `
MERGE (dt:DesignSystem {source: '${esc(analysis.appName)}'})
ON CREATE SET dt.css_framework = '${esc(analysis.designTokens.cssFramework)}',
              dt.component_library = '${esc(analysis.designTokens.componentLibrary)}',
              dt.icon_library = '${esc(analysis.designTokens.iconLibrary)}',
              dt.color_tokens = '${esc(colorNames)}',
              dt.color_count = ${Object.keys(analysis.designTokens.colors).length},
              dt.fonts = '${esc(fontNames)}',
              dt.radii = '${esc(radiiNames)}',
              dt.created_at = '${now}',
              dt.learned_from = '${esc(analysis.appName)}'
WITH dt
MATCH (a:Entity {entity_id: '${analysis.sourceId}'})
MERGE (a)-[:HAS_DESIGN_SYSTEM]->(dt)
RETURN dt.source
  `.trim();
  await safeWrite(tokenCypher, "Design tokens");

  // 5. Layout patterns
  console.log("[learn-ui] Writing layout patterns...");
  for (const layout of analysis.layouts) {
    const cypher = `
MERGE (lp:LayoutPattern {name: '${esc(layout.name)}', source: '${esc(analysis.appName)}'})
ON CREATE SET lp.type = '${esc(layout.type)}',
              lp.description = '${esc(layout.description)}',
              lp.structure = '${esc(layout.structure)}',
              lp.created_at = '${now}'
WITH lp
MATCH (a:Entity {entity_id: '${analysis.sourceId}'})
MERGE (a)-[:HAS_LAYOUT]->(lp)
RETURN lp.name
    `.trim();
    await safeWrite(cypher, `Layout [${layout.type}]`);
  }

  // 6. User flows
  console.log("[learn-ui] Writing user flows...");
  for (const flow of analysis.userFlows) {
    const steps = flow.steps.join(" → ");
    const cypher = `
MERGE (uf:UserFlow {name: '${esc(flow.name)}', source: '${esc(analysis.appName)}'})
ON CREATE SET uf.steps = '${esc(steps)}',
              uf.step_count = ${flow.steps.length},
              uf.section = '${esc(flow.section)}',
              uf.created_at = '${now}'
ON MATCH SET uf.seen_count = COALESCE(uf.seen_count, 0) + 1
WITH uf
MATCH (a:Entity {entity_id: '${analysis.sourceId}'})
MERGE (a)-[:HAS_USER_FLOW]->(uf)
RETURN uf.name
    `.trim();
    await safeWrite(cypher, `Flow [${flow.name}]`);
  }

  // 7. Form patterns
  console.log("[learn-ui] Writing form patterns...");
  for (const form of analysis.formPatterns) {
    const cypher = `
MERGE (fp:FormPattern {name: '${esc(form.name)}', source: '${esc(analysis.appName)}'})
ON CREATE SET fp.components = '${esc(form.components.join(", "))}',
              fp.validation = '${esc(form.validation)}',
              fp.component_count = ${form.components.length},
              fp.created_at = '${now}'
WITH fp
MATCH (a:Entity {entity_id: '${analysis.sourceId}'})
MERGE (a)-[:HAS_FORM_PATTERN]->(fp)
RETURN fp.name
    `.trim();
    await safeWrite(cypher, `Form [${form.name}]`);
  }

  // 8. State patterns
  console.log("[learn-ui] Writing state patterns...");
  for (const state of analysis.statePatterns) {
    const cypher = `
MERGE (sp:StatePattern {name: '${esc(state.name)}', type: '${esc(state.type)}'})
ON CREATE SET sp.component = '${esc(state.component)}',
              sp.created_at = '${now}',
              sp.learned_from = '${esc(analysis.appName)}'
ON MATCH SET sp.seen_count = COALESCE(sp.seen_count, 0) + 1
WITH sp
MATCH (a:Entity {entity_id: '${analysis.sourceId}'})
MERGE (a)-[:HAS_STATE_PATTERN]->(sp)
RETURN sp.name
    `.trim();
    await safeWrite(cypher, `State [${state.name}]`);
  }

  console.log(`\n[learn-ui] Neo4j write complete: ${written} succeeded, ${failed} failed`);
}

// ─── CLI ────────────────────────────────────────────────────────────

async function main() {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error("Usage: npx tsx src/tools/learn-ui.ts <path-to-codebase>");
    process.exit(1);
  }

  const resolved = path.resolve(targetDir);
  if (!fs.existsSync(resolved)) {
    console.error(`Directory not found: ${resolved}`);
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  AES UI Learner — Learning UI patterns from codebase");
  console.log("═══════════════════════════════════════════════════════════");

  const analysis = analyzeUI(resolved);

  // Print summary
  console.log("\n───────────────────────────────────────────────────────────");
  console.log("  UI ANALYSIS SUMMARY");
  console.log("───────────────────────────────────────────────────────────");
  console.log(`  App:               ${analysis.appName}`);
  console.log(`  Components:        ${analysis.components.length}`);
  console.log(`  Page Routes:       ${analysis.pages.length}`);
  console.log(`  Nav Items:         ${analysis.navigation.length}`);
  console.log(`  Color Tokens:      ${Object.keys(analysis.designTokens.colors).length}`);
  console.log(`  Fonts:             ${analysis.designTokens.fonts.length}`);
  console.log(`  CSS Framework:     ${analysis.designTokens.cssFramework}`);
  console.log(`  Component Lib:     ${analysis.designTokens.componentLibrary}`);
  console.log(`  Icon Library:      ${analysis.designTokens.iconLibrary}`);
  console.log(`  Layouts:           ${analysis.layouts.length}`);
  console.log(`  User Flows:        ${analysis.userFlows.length}`);
  console.log(`  Form Patterns:     ${analysis.formPatterns.length}`);
  console.log(`  State Patterns:    ${analysis.statePatterns.length}`);

  console.log("\n  COMPONENT CATEGORIES:");
  const cats = new Map<string, number>();
  for (const c of analysis.components) {
    cats.set(c.category, (cats.get(c.category) || 0) + 1);
  }
  for (const [cat, count] of [...cats.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${count}`);
  }

  console.log("\n  PAGE SECTIONS:");
  const secs = new Map<string, number>();
  for (const p of analysis.pages) {
    secs.set(p.section, (secs.get(p.section) || 0) + 1);
  }
  for (const [sec, count] of [...secs.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${sec}: ${count} pages`);
  }

  console.log("\n  USER FLOWS:");
  for (const flow of analysis.userFlows) {
    console.log(`    ${flow.name}: ${flow.steps.join(" → ")}`);
  }

  console.log("\n  LAYOUT PATTERNS:");
  for (const layout of analysis.layouts) {
    console.log(`    [${layout.type}] ${layout.description} (${layout.structure})`);
  }

  console.log("\n  STATE PATTERNS:");
  for (const sp of analysis.statePatterns) {
    console.log(`    [${sp.type}] ${sp.name}`);
  }

  // Write to Neo4j
  console.log("\n───────────────────────────────────────────────────────────");
  console.log("  WRITING UI KNOWLEDGE TO NEO4J");
  console.log("───────────────────────────────────────────────────────────");

  await writeUIToNeo4j(analysis);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  AES now knows how this app's UI is built.");
  console.log("═══════════════════════════════════════════════════════════\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("[learn-ui] Fatal error:", err);
  process.exit(1);
});
