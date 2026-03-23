import { describe, it, expect } from "vitest";
import { validateComposition } from "../src/validators/composition-validator.js";

describe("Composition Validator — Layer 4", () => {
  // ─── Dashboard Pattern ──────────────────────────────────────────────

  it("PASS: dashboard page with all sections, states, interactions, and richness", () => {
    const files = [
      {
        path: "app/page.tsx",
        content: `
          import { Card, Badge, Button, LoadingState, EmptyState, ErrorState } from "@aes/ui";
          import Link from "next/link";

          export default function DashboardPage({ user }) {
            if (isLoading) return <LoadingState />;
            if (error) return <ErrorState retry={refetch} />;
            if (!isSignedIn) return <div>Sign in to continue</div>;

            return (
              <div className="space-y-6">
                <h1 className="text-2xl font-bold">Welcome back, {user.firstName}</h1>

                <div className="grid grid-cols-3 gap-4">
                  <Card><span className="text-emerald-600">12</span> total requests</Card>
                  <Card><span className="text-amber-500">3</span> pending</Card>
                  <Card><span className="text-rose-500">1</span> rejected</Card>
                </div>

                {items.length === 0 ? (
                  <EmptyState>No recent activity. Create your first request.</EmptyState>
                ) : (
                  <div>
                    <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
                    {items.map(item => (
                      <Link href={"/requests/" + item.id} key={item.id}>
                        <div className="p-4" onClick={() => {}}>
                          <Badge>{item.status}</Badge>
                          <span>📋 {item.title}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                <div className="flex gap-6">
                  <Button onClick={() => router.push("/submit")}>Submit New Request</Button>
                  <Button variant="outline">Create Report</Button>
                </div>
              </div>
            );
          }
        `,
      },
    ];

    const result = validateComposition(files, ["dashboard"]);
    expect(result.verdict).toBe("PASS");
    expect(result.score).toBeGreaterThan(0.8);
    expect(result.stats.patterns_checked).toBe(1);
  });

  it("FAIL: dashboard page missing stat cards section", () => {
    // This page has welcome, recent activity, quick actions, and all states
    // but deliberately omits any metrics/numbers section (no "stat", "metric",
    // "count", "total", "grid-cols", or "grid cols" anywhere)
    const files = [
      {
        path: "app/page.tsx",
        content: `
          import { Button, LoadingSpinner, EmptyView, ErrorView } from "@aes/ui";
          import Link from "next/link";

          export default function DashboardPage({ user }) {
            if (isLoading) return <LoadingSpinner />;
            if (error) return <ErrorView retry={refetch} />;
            if (!isSignedIn) return <div>Sign in</div>;

            return (
              <div className="space-y-6">
                <h1 className="text-2xl font-bold">Welcome, {user.firstName}</h1>
                <div>
                  <h2 className="text-xl font-semibold">Recent items</h2>
                  <Link href="/requests/1"><div onClick={() => {}}>Item 1</div></Link>
                </div>
                <EmptyView>No items. Create your first request.</EmptyView>
                <Button>Submit New Request</Button>
              </div>
            );
          }
        `,
      },
    ];

    const result = validateComposition(files, ["dashboard"]);
    // Missing stat-cards section is an error, but score may still be above 0.6
    const statCardViolation = result.violations.find(
      (v) => v.category === "section" && v.check === "stat-cards"
    );
    expect(statCardViolation).toBeDefined();
    expect(statCardViolation!.severity).toBe("error");
  });

  // ─── Data Table Pattern ─────────────────────────────────────────────

  it("FAIL: table page without empty state", () => {
    const files = [
      {
        path: "app/(dashboard)/review-queue/page.tsx",
        content: `
          import { Table, TableHeader, TableBody, TableRow, Button, Badge, LoadingState } from "@aes/ui";
          import Link from "next/link";

          export default function ReviewQueue() {
            if (loading) return <LoadingState />;

            return (
              <div className="space-y-4">
                <h1 className="text-2xl font-bold">Review Queue</h1>
                <div>
                  <button onClick={() => setFilter("all")}>All</button>
                  <button onClick={() => setFilter("pending")}>Pending</button>
                </div>
                <Table>
                  <TableHeader>
                    <th>Title</th><th>Status</th><th>Date</th>
                  </TableHeader>
                  <TableBody>
                    {items.map(item => (
                      <TableRow key={item.id}>
                        <td>
                          <Link href={"/requests/" + item.id}>{item.title}</Link>
                        </td>
                        <td><Badge>{item.status}</Badge></td>
                        <td>{new Date(item.date).toLocaleDateString()}</td>
                        <td><Button onClick={() => {}}>View</Button></td>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div>Showing {items.length} of {total}</div>
              </div>
            );
          }
        `,
      },
    ];

    const result = validateComposition(files, ["review-queue"]);
    const emptyViolation = result.violations.find(
      (v) => v.category === "state" && v.check === "empty"
    );
    expect(emptyViolation).toBeDefined();
    expect(emptyViolation!.severity).toBe("error");
  });

  // ─── Form Pattern ──────────────────────────────────────────────────

  it("FAIL: form page without success feedback state", () => {
    // This form has submitting state and field validation but no success
    // feedback (no "success", "Success", "created", "submitted", "router.push",
    // or "redirect" anywhere)
    const files = [
      {
        path: "app/(dashboard)/requests/page.tsx",
        content: `
          import { Card, CardContent, CardHeader, Input, Button } from "@aes/ui";

          export default function SubmitRequest() {
            return (
              <Card>
                <CardHeader>
                  <h1 className="text-2xl font-bold">Submit New Request</h1>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label htmlFor="title">Title</label>
                  <Input id="title" placeholder="e.g. Equipment request" onChange={(e) => setTitle(e.target.value)} />
                  <label htmlFor="desc">Description</label>
                  <Input id="desc" />
                  {titleError && <span className="text-sm">Title is required</span>}
                  <div className="flex gap-4">
                    <Button type="submit" disabled={isSubmitting || !title}>
                      {isSubmitting ? "Submitting..." : "Submit"}
                    </Button>
                    <Button variant="outline" onClick={goBack}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            );
          }
        `,
      },
    ];

    const result = validateComposition(files, ["submit"]);
    // Should detect missing success state — no toast, redirect, or success message
    const successViolation = result.violations.find(
      (v) => v.category === "state" && v.check === "success"
    );
    expect(successViolation).toBeDefined();
    expect(successViolation!.severity).toBe("error");
  });

  // ─── Detail Pattern ────────────────────────────────────────────────

  it("FAIL: detail page without confirmation dialog", () => {
    const files = [
      {
        path: "app/(dashboard)/requests/[id]/page.tsx",
        content: `
          import { Card, Badge, Button, LoadingState, ErrorState } from "@aes/ui";

          export default function DetailPage({ params }) {
            if (loading) return <LoadingState />;
            if (error) return <ErrorState />;
            if (!item) return <div>Not found</div>;

            return (
              <div className="space-y-6">
                <a href="/review-queue">← Back</a>
                <h1 className="text-2xl font-bold">{item.title}</h1>
                <Badge>{item.status}</Badge>
                <div>Created by {item.author} on {item.date}</div>
                <Card>
                  <p>{item.description}</p>
                </Card>
                <div className="flex gap-4">
                  <Button onClick={() => approve(item.id)}>Approve</Button>
                  <Button variant="destructive" onClick={() => reject(item.id)}>Reject</Button>
                </div>
                <div>
                  <h3>Comments</h3>
                  {item.comments.map(c => <div key={c.id}>{c.text}</div>)}
                  <Button onClick={() => addComment()}>Add Comment</Button>
                </div>
              </div>
            );
          }
        `,
      },
    ];

    const result = validateComposition(files, ["detail"]);
    // Missing confirmation state (no Dialog, Confirm, "Are you sure")
    const confirmViolation = result.violations.find(
      (v) => v.category === "state" && v.check === "confirmation"
    );
    expect(confirmViolation).toBeDefined();
    expect(confirmViolation!.severity).toBe("error");
  });

  // ─── Richness Only ─────────────────────────────────────────────────

  it("PASS_WITH_CONCERNS: page with no icons or color (richness warnings only)", () => {
    const files = [
      {
        path: "app/page.tsx",
        content: `
          import { Card, Button, LoadingState, EmptyState, ErrorState } from "@aes/ui";
          import Link from "next/link";

          export default function DashboardPage({ user }) {
            if (isLoading) return <LoadingState />;
            if (error) return <ErrorState retry={refetch} />;
            if (!isSignedIn) return <div>Sign in to continue</div>;

            return (
              <div>
                <h1>Welcome, {user.firstName}</h1>
                <div>
                  <Card>total: 5</Card>
                  <Card>count: 3</Card>
                </div>
                {items.length === 0 ? (
                  <EmptyState>No items. Create your first request.</EmptyState>
                ) : (
                  <div>
                    <div>Recent Activity</div>
                    {items.map(item => (
                      <Link href={"/requests/" + item.id} key={item.id}>
                        <div onClick={() => {}}>{item.title}</div>
                      </Link>
                    ))}
                  </div>
                )}
                <Button>Submit New Request</Button>
              </div>
            );
          }
        `,
      },
    ];

    const result = validateComposition(files, ["dashboard"]);
    // All sections/states/interactions should pass, but richness warnings
    const richnessViolations = result.violations.filter(
      (v) => v.category === "richness"
    );
    expect(richnessViolations.length).toBeGreaterThan(0);
    // All richness violations should be warnings
    expect(richnessViolations.every((v) => v.severity === "warning")).toBe(true);

    // Verdict should be PASS_WITH_CONCERNS since there are many warnings
    expect(["PASS", "PASS_WITH_CONCERNS"]).toContain(result.verdict);
  });

  // ─── Complete Well-Built Page ──────────────────────────────────────

  it("PASS with high score: complete well-built data table page", () => {
    const files = [
      {
        path: "app/(dashboard)/review-queue/page.tsx",
        content: `
          import { Table, TableHeader, TableBody, TableRow, Button, Badge, LoadingState, EmptyState, ErrorState, Checkbox } from "@aes/ui";
          import Link from "next/link";

          export default function ReviewQueue() {
            if (loading) return <LoadingState />;
            if (error) return <ErrorState retry={refetch} />;

            const filtered = items.filter(i => filter === "all" || i.status === filter);

            return (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h1 className="text-2xl font-bold">Review Queue</h1>
                  <Button>Create New</Button>
                </div>

                <div className="flex gap-4">
                  <button className={tab === "all" ? "font-bold" : ""} onClick={() => setFilter("all")}>
                    All ({total})
                  </button>
                  <button onClick={() => setFilter("pending")}>Pending (Count: {pendingCount})</button>
                  <button onClick={() => setFilter("approved")}>Approved</button>
                </div>

                {filtered.length === 0 && filter !== "all" ? (
                  <EmptyState>No items found for this filter. Try a different status or clear filter.</EmptyState>
                ) : filtered.length === 0 ? (
                  <EmptyState>No requests yet.</EmptyState>
                ) : (
                  <Table>
                    <TableHeader>
                      <th><Checkbox onChange={selectAll} aria-label="Select all" /></th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(item => (
                        <TableRow key={item.id}>
                          <td><Checkbox checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td>
                          <td>
                            <Link href={"/requests/" + item.id}>
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                  {item.author[0]}
                                </div>
                                {item.title}
                              </div>
                            </Link>
                          </td>
                          <td><Badge className={item.status === "approved" ? "bg-emerald-100" : "bg-amber-100"}>{item.status}</Badge></td>
                          <td>{new Date(item.date).toLocaleDateString()}</td>
                          <td><Button size="sm" onClick={() => review(item.id)}>Review</Button></td>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                <div className="flex justify-between">
                  <span>Showing {filtered.length} of {total}</span>
                  <Button variant="outline" onClick={loadMore}>Load more</Button>
                </div>
              </div>
            );
          }
        `,
      },
    ];

    const result = validateComposition(files, ["review-queue"]);
    expect(result.verdict).toBe("PASS");
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.stats.patterns_checked).toBe(1);
    expect(result.violations.filter((v) => v.severity === "error").length).toBe(0);
  });

  // ─── Feature name mapping ──────────────────────────────────────────

  it("maps feature names to patterns correctly", () => {
    // "audit" feature should check audit-log-page pattern
    const files = [
      {
        path: "app/(dashboard)/audit/page.tsx",
        content: `
          import { Table, TableHeader, TableBody, Badge, LoadingState, EmptyState } from "@aes/ui";

          export default function AuditTrail() {
            if (loading) return <LoadingState />;
            return (
              <div>
                <h1>Audit Log</h1>
                <div>
                  <button onClick={() => setFilter("all")}>All actions</button>
                  <button onClick={() => setFilter("create")}>Create</button>
                </div>
                {items.length === 0 ? (
                  <EmptyState>No audit entries.</EmptyState>
                ) : (
                  <Table>
                    <TableHeader><th>Action</th><th>Actor</th><th>Date</th></TableHeader>
                    <TableBody>
                      {items.map(e => (
                        <tr key={e.id}>
                          <td><Badge>{e.action}</Badge></td>
                          <td>{e.actor}</td>
                          <td>{new Date(e.date).toLocaleString()}</td>
                        </tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <Button onClick={loadMore}>Load more</Button>
              </div>
            );
          }
        `,
      },
    ];

    const result = validateComposition(files, ["audit-trail"]);
    expect(result.stats.patterns_checked).toBe(1);
    // Should have found most things
    expect(result.score).toBeGreaterThan(0.5);
  });

  // ─── No matching pattern ───────────────────────────────────────────

  it("PASS with score 1 when no patterns match (nothing to check)", () => {
    const files = [
      {
        path: "lib/utils.ts",
        content: `export const formatDate = (d: Date) => d.toISOString();`,
      },
    ];

    const result = validateComposition(files, ["notification"]);
    expect(result.verdict).toBe("PASS");
    expect(result.score).toBe(1);
    expect(result.stats.patterns_checked).toBe(0);
  });

  // ─── Path-based inference ──────────────────────────────────────────

  it("infers pattern from file path even without feature names", () => {
    const files = [
      {
        path: "app/(dashboard)/review-queue/page.tsx",
        content: `
          import { Table, TableHeader, TableBody, TableRow, Button, Badge, LoadingState, EmptyState, ErrorState } from "@aes/ui";
          export default function Page() {
            if (loading) return <LoadingState />;
            if (error) return <ErrorState />;
            return (
              <div>
                <h1 className="text-2xl font-bold">Queue</h1>
                <div><button onClick={() => setFilter("pending")}>Status filter</button></div>
                <Table><TableHeader /><TableBody><TableRow><td><a href="/requests/1">Link</a></td><td><Button onClick={() => {}}>action</Button></td></TableRow></TableBody></Table>
                {items.length === 0 && <EmptyState>No items</EmptyState>}
                <div>Showing 10</div>
              </div>
            );
          }
        `,
      },
    ];

    // Pass empty feature names — should still detect data-table-page from path
    const result = validateComposition(files, []);
    expect(result.stats.patterns_checked).toBe(1);
  });
});
