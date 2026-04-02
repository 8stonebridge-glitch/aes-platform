/**
 * batch-learn.ts — Clone and scan multiple open-source apps into the knowledge graph.
 *
 * Clones repos to a temp directory, runs learn-app.ts on each, then cleans up.
 *
 * Usage:
 *   npx tsx src/tools/batch-learn.ts                          # scan all repos in the list
 *   npx tsx src/tools/batch-learn.ts --only crm,payments      # scan specific categories
 *   npx tsx src/tools/batch-learn.ts --dry-run                # show what would be scanned
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// ═══════════════════════════════════════════════════════════════════════
// TARGET REPOS — high-quality open-source apps that fill graph gaps
// ═══════════════════════════════════════════════════════════════════════

interface RepoTarget {
  url: string;
  name: string;
  category: string;
  /** Why this app is valuable for the graph */
  value: string;
  /** Subdirectory to scan (for monorepos) — empty string = root */
  scanDir: string;
  /** Sparse checkout paths (to speed up clone) — empty = full clone */
  sparse?: string[];
}

const REPOS: RepoTarget[] = [
  // ── Payments / Finance (gap) — JS/TS only ──
  {
    url: "https://github.com/medusajs/medusa",
    name: "medusa",
    category: "ecommerce",
    value: "Headless commerce: products, carts, orders, payments, shipping, discounts, regions. TS/Node.",
    scanDir: "",
  },

  // ── Auth (gap) — TS monorepo ──
  {
    url: "https://github.com/logto-io/logto",
    name: "logto",
    category: "auth",
    value: "Auth platform: SSO, RBAC, OAuth providers, user management, MFA, org tenancy. TS.",
    scanDir: "",
  },

  // ── Automation / Workflows — TS monorepo ──
  {
    url: "https://github.com/n8n-io/n8n",
    name: "n8n",
    category: "automation",
    value: "Workflow automation: nodes, connections, triggers, credentials, execution history. TS.",
    scanDir: "",
  },

  // ── Secrets (Infisical is in but empty — re-scan) — TS monorepo ──
  {
    url: "https://github.com/Infisical/infisical",
    name: "infisical",
    category: "secrets",
    value: "Secrets management: vaults, environments, key rotation, access policies, audit logs. TS.",
    scanDir: "",
  },

  // ── Forms / Surveys — TS monorepo ──
  {
    url: "https://github.com/typebot-io/typebot.io",
    name: "typebot",
    category: "forms",
    value: "Conversational forms: flows, blocks, conditions, integrations, results, analytics. TS.",
    scanDir: "",
  },

  // ── Notification system — TS monorepo ──
  {
    url: "https://github.com/novuhq/novu",
    name: "novu",
    category: "notifications",
    value: "Notification infrastructure: channels (email, SMS, push, chat), templates, workflows, subscribers. TS.",
    scanDir: "",
  },

  // ── Chat / Real-time — TS ──
  {
    url: "https://github.com/RocketChat/Rocket.Chat",
    name: "rocketchat",
    category: "chat",
    value: "Team chat: channels, threads, DMs, video, file sharing, bots, integrations. TS/Meteor.",
    scanDir: "",
  },

  // ── Analytics / Dashboard — Next.js TS ──
  {
    url: "https://github.com/umami-software/umami",
    name: "umami",
    category: "analytics",
    value: "Web analytics: pageviews, visitors, sources, events, goals, realtime. Next.js/TS.",
    scanDir: "",
  },

  // ── CRM — already have Twenty in graph but misclassified, re-scan with proper class ──
  {
    url: "https://github.com/twentyhq/twenty",
    name: "twenty-crm",
    category: "crm",
    value: "Full CRM: contacts, companies, deals, pipelines, activities, custom objects. TS monorepo.",
    scanDir: "",
  },

  // ── Email / Marketing — TS ──
  {
    url: "https://github.com/useplunk/plunk",
    name: "plunk",
    category: "email",
    value: "Email platform: campaigns, contacts, events, templates, transactional email. TS/Next.js.",
    scanDir: "",
  },
];

// ═══════════════════════════════════════════════════════════════════════
// CLONE + SCAN LOGIC
// ═══════════════════════════════════════════════════════════════════════

const CLONE_DIR = "/tmp/aes-batch-learn";

function cloneRepo(repo: RepoTarget): string | null {
  const targetDir = join(CLONE_DIR, repo.name);

  if (existsSync(targetDir)) {
    console.log(`    ⏭️  Already cloned: ${targetDir}`);
    return targetDir;
  }

  try {
    mkdirSync(CLONE_DIR, { recursive: true });

    // Shallow clone (depth=1) to save time and disk
    console.log(`    📥 Cloning ${repo.url}...`);
    execSync(
      `git clone --depth 1 --single-branch ${repo.url} ${targetDir}`,
      { timeout: 300_000, stdio: "pipe" }, // 5 min max
    );

    console.log(`    ✅ Cloned to ${targetDir}`);
    return targetDir;
  } catch (err: any) {
    console.warn(`    ❌ Clone failed: ${err.message?.slice(0, 100)}`);
    return null;
  }
}

function scanRepo(repoDir: string, repo: RepoTarget): boolean {
  const scanPath = repo.scanDir ? join(repoDir, repo.scanDir) : repoDir;

  try {
    console.log(`    🔍 Scanning ${scanPath}...`);
    const output = execSync(
      `npx tsx src/tools/learn-app.ts "${scanPath}" --source-url=${repo.url}`,
      {
        timeout: 600_000, // 10 min max per app
        maxBuffer: 50 * 1024 * 1024,
        cwd: process.cwd(),
        stdio: "pipe",
      },
    );
    const lines = output.toString().split("\n");
    // Print last few lines (summary)
    const summaryLines = lines.filter(l => l.includes("✅") || l.includes("features") || l.includes("models") || l.includes("DONE"));
    for (const line of summaryLines.slice(-5)) {
      console.log(`    ${line.trim()}`);
    }
    return true;
  } catch (err: any) {
    console.warn(`    ❌ Scan failed: ${err.message?.slice(0, 200)}`);
    return false;
  }
}

function cleanupRepo(repo: RepoTarget) {
  const targetDir = join(CLONE_DIR, repo.name);
  if (existsSync(targetDir)) {
    try {
      rmSync(targetDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyCategories = args.includes("--only")
    ? args[args.indexOf("--only") + 1]?.split(",") || []
    : [];
  const keepClones = args.includes("--keep");

  let repos = REPOS;
  if (onlyCategories.length > 0) {
    repos = repos.filter(r => onlyCategories.includes(r.category));
  }

  console.log(`\n${"═".repeat(65)}`);
  console.log(`  AES BATCH APP LEARNER`);
  console.log(`  Repos: ${repos.length}`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "CLONE + SCAN"}`);
  console.log(`${"═".repeat(65)}\n`);

  if (dryRun) {
    for (const repo of repos) {
      console.log(`  ${repo.name.padEnd(25)} [${repo.category.padEnd(15)}] ${repo.url}`);
      console.log(`  ${"".padEnd(25)} ${repo.value}\n`);
    }
    console.log(`\nRun without --dry-run to clone and scan.`);
    return;
  }

  let succeeded = 0;
  let failed = 0;

  // Parse concurrency flag (default: 3 parallel repo scans)
  const concurrencyIdx = args.indexOf("--concurrency");
  const maxConcurrency = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1] || "3", 10) : 3;
  const serial = args.includes("--serial");

  if (serial || maxConcurrency <= 1) {
    // Sequential mode (original behavior)
    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i];
      console.log(`\n  ▸ [${i + 1}/${repos.length}] ${repo.name} (${repo.category})`);
      console.log(`    ${repo.url}`);

      const dir = cloneRepo(repo);
      if (!dir) { failed++; continue; }

      const ok = scanRepo(dir, repo);
      if (ok) { succeeded++; } else { failed++; }

      if (!keepClones) cleanupRepo(repo);
    }
  } else {
    // Parallel mode — process repos with semaphore
    console.log(`  Concurrency: ${maxConcurrency} parallel\n`);

    // Simple semaphore for controlling parallelism
    let running = 0;
    const queue: Array<() => void> = [];
    const acquire = () => new Promise<void>(resolve => {
      if (running < maxConcurrency) { running++; resolve(); }
      else queue.push(() => { running++; resolve(); });
    });
    const release = () => { running--; if (queue.length > 0) queue.shift()!(); };

    // Clone all repos first (parallel with semaphore — I/O bound)
    console.log(`  Phase 1: Cloning ${repos.length} repos (max ${maxConcurrency} parallel)...`);
    const cloneResults = await Promise.allSettled(
      repos.map(async (repo, i) => {
        await acquire();
        try {
          console.log(`  ▸ [${i + 1}/${repos.length}] Cloning ${repo.name}...`);
          return { repo, dir: cloneRepo(repo) };
        } finally { release(); }
      })
    );

    // Scan repos in parallel (CPU + I/O bound — main bottleneck)
    console.log(`\n  Phase 2: Scanning repos (max ${maxConcurrency} parallel)...`);
    running = 0; // reset semaphore
    const scanResults = await Promise.allSettled(
      cloneResults.map(async (result, i) => {
        if (result.status !== "fulfilled" || !result.value.dir) {
          failed++;
          return;
        }
        const { repo, dir } = result.value;
        await acquire();
        try {
          console.log(`  ▸ [${i + 1}/${repos.length}] Scanning ${repo.name} (${repo.category})...`);
          const ok = scanRepo(dir, repo);
          if (ok) { succeeded++; } else { failed++; }
        } finally {
          release();
          if (!keepClones) cleanupRepo(result.value.repo);
        }
      })
    );
  }

  console.log(`\n${"═".repeat(65)}`);
  console.log(`  DONE: ${succeeded} succeeded, ${failed} failed (${repos.length} total)`);
  if (!keepClones) {
    console.log(`  Clones cleaned up from ${CLONE_DIR}`);
  } else {
    console.log(`  Clones kept at ${CLONE_DIR}`);
  }
  console.log(`${"═".repeat(65)}\n`);
}

main().catch(console.error);
