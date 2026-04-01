import { describe, it, expect } from "vitest";
import {
  matchFeatureArchetype,
  deriveArchetypeSlots,
  renderArchetypeFiles,
  getArchetypeIds,
  getArchetype,
} from "../../src/contracts/framework-contract-layer.js";

describe("matchFeatureArchetype", () => {
  it("matches 'User Settings' to settings archetype", () => {
    const arch = matchFeatureArchetype("User Settings");
    expect(arch).not.toBeNull();
    expect(arch!.id).toBe("settings");
  });

  it("matches 'My Profile' to profile archetype", () => {
    const arch = matchFeatureArchetype("My Profile");
    expect(arch).not.toBeNull();
    expect(arch!.id).toBe("profile");
  });

  it("matches 'Team Management' to org-management archetype", () => {
    const arch = matchFeatureArchetype("Team Management");
    expect(arch).not.toBeNull();
    expect(arch!.id).toBe("org-management");
  });

  it("matches 'Admin Dashboard' to admin-panel archetype", () => {
    const arch = matchFeatureArchetype("Admin Dashboard");
    expect(arch).not.toBeNull();
    expect(arch!.id).toBe("admin-panel");
  });

  it("matches 'Authentication' to auth archetype", () => {
    const arch = matchFeatureArchetype("Authentication");
    expect(arch).not.toBeNull();
    expect(arch!.id).toBe("auth");
  });

  it("matches 'Sign In' to auth archetype", () => {
    const arch = matchFeatureArchetype("Sign In");
    expect(arch).not.toBeNull();
    expect(arch!.id).toBe("auth");
  });

  it("matches 'Notification Preferences' to settings via description", () => {
    const arch = matchFeatureArchetype("Notification Preferences", "User notification settings and configuration");
    expect(arch).not.toBeNull();
    expect(arch!.id).toBe("settings");
  });

  it("matches 'Invite Members' to org-management via capabilities", () => {
    const arch = matchFeatureArchetype("Collaboration", undefined, ["invite members", "manage team"]);
    expect(arch).not.toBeNull();
    expect(arch!.id).toBe("org-management");
  });

  it("returns null for generic features like 'Ticket Board'", () => {
    const arch = matchFeatureArchetype("Ticket Board", "A kanban board for tracking issues");
    expect(arch).toBeNull();
  });

  it("returns null for generic features like 'Inventory Tracker'", () => {
    const arch = matchFeatureArchetype("Inventory Tracker");
    expect(arch).toBeNull();
  });
});

describe("deriveArchetypeSlots", () => {
  it("derives correct table name and slug for settings", () => {
    const arch = getArchetype("settings");
    const slots = deriveArchetypeSlots("User Settings", arch);
    expect(slots.TABLE).toBe("user_settings");
    expect(slots.FEATURE_SLUG).toBe("user-settings");
    expect(slots.FEATURE_LABEL).toBe("User Settings");
    expect(slots.ROUTE).toBe("/user-settings");
    expect(slots.FIELDS.length).toBeGreaterThan(0);
  });

  it("derives correct table name for org management", () => {
    const arch = getArchetype("org-management");
    const slots = deriveArchetypeSlots("Team Members", arch);
    expect(slots.TABLE).toBe("team_members");
    expect(slots.FEATURE_SLUG).toBe("team-members");
  });
});

describe("renderArchetypeFiles", () => {
  it("renders settings archetype with correct table references", () => {
    const arch = getArchetype("settings");
    const slots = deriveArchetypeSlots("App Settings", arch);
    const files = renderArchetypeFiles(arch, slots);

    // Queries should reference the correct table
    expect(files.queries).toContain('"app_settings"');
    expect(files.queries).toContain("returns:");
    expect(files.queries).toContain("v.union");

    // Mutations should use returns: validator
    expect(files.mutations).toContain("returns:");
    expect(files.mutations).toContain('v.id("app_settings")');

    // Form page should have useAuth with orgId
    expect(files.formPage).toContain("useAuth");
    expect(files.formPage).toContain("orgId");

    // No list page for settings
    expect(files.listPage).toBe("");
  });

  it("renders auth archetype with Clerk components only", () => {
    const arch = getArchetype("auth");
    const slots = deriveArchetypeSlots("Authentication", arch);
    const files = renderArchetypeFiles(arch, slots);

    // Auth uses Clerk components — no custom Convex code
    expect(files.queries).toBe("");
    expect(files.mutations).toBe("");
    expect(files.schemaFields).toBe("");

    // Sign-in page uses Clerk SignIn
    expect(files.formPage).toContain("SignIn");
    expect(files.formPage).toContain("@clerk/nextjs");

    // Sign-up page uses Clerk SignUp
    expect(files.detailPage).toContain("SignUp");
    expect(files.detailPage).toContain("@clerk/nextjs");
  });

  it("renders org-management archetype with orgId enforcement", () => {
    const arch = getArchetype("org-management");
    const slots = deriveArchetypeSlots("Team Members", arch);
    const files = renderArchetypeFiles(arch, slots);

    // Queries enforce orgId
    expect(files.queries).toContain("args: { orgId: v.string()");
    expect(files.queries).toContain("returns:");

    // Mutations enforce orgId
    expect(files.mutations).toContain("orgId: v.string()");
    expect(files.mutations).toContain("returns:");

    // Remove checks org ownership
    expect(files.mutations).toContain("item.orgId !== args.orgId");

    // List page exists
    expect(files.listPage).toContain("useQuery");
    expect(files.listPage).toContain("orgId");
  });

  it("renders admin-panel with role-appropriate mutations", () => {
    const arch = getArchetype("admin-panel");
    const slots = deriveArchetypeSlots("Admin Panel", arch);
    const files = renderArchetypeFiles(arch, slots);

    expect(files.queries).toContain("returns:");
    expect(files.mutations).toContain("remove");
    expect(files.mutations).toContain("Not found or unauthorized");
  });

  it("renders profile with userId-based queries", () => {
    const arch = getArchetype("profile");
    const slots = deriveArchetypeSlots("User Profile", arch);
    const files = renderArchetypeFiles(arch, slots);

    expect(files.queries).toContain("userId: v.string()");
    expect(files.queries).toContain("returns:");
    expect(files.mutations).toContain("upsert");
    expect(files.formPage).toContain("useAuth");
  });
});

describe("archetype registry", () => {
  it("has all 5 archetypes registered", () => {
    const ids = getArchetypeIds();
    expect(ids).toContain("settings");
    expect(ids).toContain("profile");
    expect(ids).toContain("org-management");
    expect(ids).toContain("admin-panel");
    expect(ids).toContain("auth");
    expect(ids.length).toBe(5);
  });

  it("every Convex archetype includes returns: validator", () => {
    for (const id of getArchetypeIds()) {
      const arch = getArchetype(id);
      if (arch.files.queries) {
        expect(arch.files.queries).toContain("returns:");
      }
      if (arch.files.mutations) {
        expect(arch.files.mutations).toContain("returns:");
      }
    }
  });

  it("every archetype with pages uses orgId or userId from useAuth", () => {
    for (const id of getArchetypeIds()) {
      const arch = getArchetype(id);
      if (arch.files.listPage) {
        expect(arch.files.listPage).toContain("useAuth");
      }
      if (arch.files.formPage && arch.files.formPage.includes("useAuth")) {
        expect(arch.files.formPage).toContain("orgId");
      }
    }
  });
});
