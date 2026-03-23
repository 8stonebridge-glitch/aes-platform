/**
 * Layer 4 — Pattern Requirements Schema
 *
 * Defines what a "well-built page" looks like for each page archetype.
 * Used by the Composition Validator to check that built pages conform
 * to patterns, not just that they use the right components.
 */

export interface PatternRequirement {
  pattern_id: string;
  pattern_name: string;

  // Required page sections (checked by presence in JSX)
  required_sections: {
    id: string;
    name: string;
    description: string;
    // Markers: CSS classes, component names, or text that indicate the section exists
    markers: string[];
  }[];

  // Required UI states the page must handle
  required_states: {
    state: string;
    description: string;
    // What component/pattern indicates this state is handled
    markers: string[];
  }[];

  // Required interactions
  required_interactions: {
    interaction: string;
    description: string;
    markers: string[];
  }[];

  // Minimum visual richness indicators
  richness_checks: {
    check: string;
    description: string;
    markers: string[];
    severity: "error" | "warning";
  }[];
}

// Pre-defined patterns for common page types
export const PAGE_PATTERNS: Record<string, PatternRequirement> = {
  "dashboard-overview": {
    pattern_id: "dashboard-overview",
    pattern_name: "Dashboard Overview Page",
    required_sections: [
      { id: "welcome", name: "Welcome/greeting header", description: "Personalized greeting with user name", markers: ["Welcome", "Good morning", "Hello", "userName", "firstName"] },
      { id: "stat-cards", name: "Stat cards row", description: "3-5 metric cards showing key numbers", markers: ["stat", "metric", "count", "total", "grid-cols", "grid cols"] },
      { id: "recent-activity", name: "Recent activity list", description: "List or table of recent items", markers: ["recent", "latest", "activity", "Recent"] },
      { id: "quick-actions", name: "Quick action buttons", description: "Primary actions the user can take", markers: ["Submit", "Create", "New", "Quick", "action"] },
    ],
    required_states: [
      { state: "loading", description: "Skeleton/loading state while data fetches", markers: ["LoadingState", "Skeleton", "loading", "isLoading"] },
      { state: "empty", description: "Empty state when no data exists yet", markers: ["EmptyState", "No ", "no ", "Get started", "Create your first"] },
      { state: "signed-out", description: "Landing/sign-in prompt when not authenticated", markers: ["Sign in", "SignIn", "signed-out", "isSignedIn"] },
      { state: "error", description: "Error state when data fetch fails", markers: ["ErrorState", "error", "Error", "retry", "try again"] },
    ],
    required_interactions: [
      { interaction: "navigate-to-detail", description: "Click item to view detail", markers: ["href=", "Link", "router.push", "onClick"] },
      { interaction: "create-new", description: "Button to create new item", markers: ["Submit", "Create", "New request"] },
    ],
    richness_checks: [
      { check: "icons", description: "Uses icons for visual hierarchy", markers: ["Icon", "icon", "svg", "\u2192", "\u2190", "\u2022", "\u2713", "\ud83d\udcca", "\ud83d\udccb", "\ud83d\udcdd", "\u2709"], severity: "warning" },
      { check: "color-system", description: "Uses semantic colors (green=good, red=bad, yellow=pending)", markers: ["green", "red", "yellow", "blue", "emerald", "rose", "amber"], severity: "warning" },
      { check: "typography-hierarchy", description: "Has clear heading hierarchy", markers: ["text-3xl", "text-2xl", "text-xl", "text-lg", "font-bold", "font-semibold"], severity: "warning" },
      { check: "spacing-system", description: "Consistent spacing tokens", markers: ["gap-6", "gap-4", "space-y-6", "space-y-4", "p-6", "p-4", "mb-6", "mb-4"], severity: "warning" },
    ],
  },

  "data-table-page": {
    pattern_id: "data-table-page",
    pattern_name: "Data Table Page",
    required_sections: [
      { id: "page-header", name: "Page header with title and actions", description: "Title, description, and primary action button", markers: ["text-2xl", "font-bold", "Button"] },
      { id: "filters", name: "Filter controls", description: "Status tabs, search, or faceted filters", markers: ["Tabs", "Tab", "filter", "Filter", "search", "Search", "status"] },
      { id: "table", name: "Data table", description: "Table with headers, rows, and proper formatting", markers: ["Table", "TableHeader", "TableBody", "TableRow"] },
      { id: "row-actions", name: "Row-level actions", description: "Action buttons or links per row", markers: ["Button", "Link", "action", "onClick"] },
      { id: "pagination", name: "Pagination or load more", description: "Way to see more results", markers: ["Load more", "Next", "Previous", "page", "Showing"] },
    ],
    required_states: [
      { state: "loading", description: "Table skeleton while loading", markers: ["LoadingState", "Skeleton", "loading"] },
      { state: "empty", description: "Empty state when no rows match", markers: ["EmptyState", "No ", "no results", "no requests"] },
      { state: "filtered-empty", description: "Empty state specific to active filter", markers: ["No.*match", "no.*found", "clear filter", "try different"] },
      { state: "error", description: "Error fetching data", markers: ["ErrorState", "error", "retry"] },
    ],
    required_interactions: [
      { interaction: "filter-by-status", description: "Filter table by status", markers: ["status", "Status", "setFilter", "filter", "tab"] },
      { interaction: "click-to-detail", description: "Click row to see detail", markers: ["href", "Link", "router.push", "/requests/"] },
      { interaction: "bulk-select", description: "Select multiple rows for bulk action", markers: ["checkbox", "Checkbox", "selected", "Select all", "bulk"] },
    ],
    richness_checks: [
      { check: "status-badges", description: "Status shown as colored badges", markers: ["Badge", "StatusBadge", "badge"], severity: "warning" },
      { check: "timestamps", description: "Human-readable date formatting", markers: ["toLocaleDateString", "toLocaleString", "date", "Date", "ago"], severity: "warning" },
      { check: "avatars", description: "User identity shown with avatars or initials", markers: ["Avatar", "avatar", "initials", "rounded-full"], severity: "warning" },
      { check: "count-indicators", description: "Shows counts per filter/status", markers: ["count", "Count", "total", "Total", "("], severity: "warning" },
    ],
  },

  "detail-page": {
    pattern_id: "detail-page",
    pattern_name: "Detail Page",
    required_sections: [
      { id: "back-nav", name: "Back navigation", description: "Way to go back to list", markers: ["Back", "back", "\u2190", "chevron", "Return"] },
      { id: "header", name: "Item header with title and status", description: "Title, status badge, metadata", markers: ["text-2xl", "font-bold", "Badge", "StatusBadge"] },
      { id: "metadata", name: "Metadata section", description: "Created by, date, assignee, etc.", markers: ["Created", "created", "Date", "by", "Submitted"] },
      { id: "content", name: "Main content area", description: "Primary content of the item", markers: ["Card", "description", "content", "detail"] },
      { id: "actions", name: "Action buttons", description: "Primary actions (approve, reject, edit)", markers: ["Button", "Approve", "Reject", "Edit", "action"] },
      { id: "activity", name: "Activity/timeline section", description: "History of changes, comments", markers: ["Timeline", "timeline", "Comment", "comment", "Activity", "History"] },
    ],
    required_states: [
      { state: "loading", description: "Loading state", markers: ["LoadingState", "loading"] },
      { state: "not-found", description: "Item not found", markers: ["not found", "Not found", "404", "doesn't exist"] },
      { state: "error", description: "Error loading", markers: ["ErrorState", "error"] },
      { state: "confirmation", description: "Confirmation before destructive action", markers: ["Dialog", "Confirm", "confirm", "Are you sure"] },
    ],
    required_interactions: [
      { interaction: "state-transition", description: "Change item state", markers: ["transition", "Transition", "approve", "reject", "Approve", "Reject"] },
      { interaction: "add-comment", description: "Add a comment", markers: ["comment", "Comment", "reply", "Reply", "Add"] },
    ],
    richness_checks: [
      { check: "status-prominent", description: "Status is visually prominent", markers: ["StatusBadge", "Badge", "text-lg", "text-xl"], severity: "warning" },
      { check: "timeline-visual", description: "Timeline has visual indicators", markers: ["border-l", "circle", "dot", "line", "step"], severity: "warning" },
      { check: "confirmation-dialog", description: "Destructive actions have confirmation", markers: ["Dialog", "DialogContent", "Confirm", "Cancel"], severity: "warning" },
    ],
  },

  "form-page": {
    pattern_id: "form-page",
    pattern_name: "Form Page",
    required_sections: [
      { id: "title", name: "Form title", description: "Clear heading explaining what the form does", markers: ["text-2xl", "font-bold", "Submit", "Create", "Request"] },
      { id: "form-fields", name: "Labeled form fields", description: "Input fields with labels", markers: ["Input", "Textarea", "label", "Label", "htmlFor"] },
      { id: "submit-action", name: "Submit button", description: "Clear submit action", markers: ["Submit", "submit", "Create", "Save", "type=\"submit\""] },
      { id: "cancel-action", name: "Cancel/back option", description: "Way to cancel without submitting", markers: ["Cancel", "cancel", "Back", "back"] },
    ],
    required_states: [
      { state: "submitting", description: "Loading state during submission", markers: ["Submitting", "submitting", "isSubmitting", "disabled", "Loading"] },
      { state: "validation-error", description: "Field-level validation errors", markers: ["error", "Error", "required", "invalid", "must", "please"] },
      { state: "success", description: "Success feedback after submission", markers: ["success", "Success", "created", "submitted", "router.push", "redirect"] },
    ],
    required_interactions: [
      { interaction: "field-validation", description: "Fields validate on change or blur", markers: ["required", "onChange", "onBlur", "validate", "error"] },
      { interaction: "submit-disabled", description: "Submit disabled when form invalid", markers: ["disabled", "!title", "!description"] },
    ],
    richness_checks: [
      { check: "card-container", description: "Form wrapped in a card", markers: ["Card", "CardContent", "CardHeader"], severity: "warning" },
      { check: "field-spacing", description: "Consistent spacing between fields", markers: ["space-y", "gap-", "mb-4", "mb-6"], severity: "warning" },
      { check: "helper-text", description: "Placeholder or helper text on fields", markers: ["placeholder", "Placeholder", "helper", "e.g."], severity: "warning" },
    ],
  },

  "role-selection-page": {
    pattern_id: "role-selection-page",
    pattern_name: "Role Selection Page",
    required_sections: [
      { id: "heading", name: "Clear heading", description: "Explains what the user is choosing", markers: ["Choose", "Select", "Role", "role"] },
      { id: "options", name: "Role option cards", description: "One card per role with description", markers: ["Card", "submitter", "reviewer", "admin", "Submitter", "Reviewer", "Admin"] },
    ],
    required_states: [
      { state: "saving", description: "Loading state while saving selection", markers: ["saving", "Saving", "disabled", "Loading"] },
      { state: "no-org", description: "Message when no org selected", markers: ["organization", "org", "sign in", "select"] },
    ],
    required_interactions: [
      { interaction: "select-role", description: "Click to select a role", markers: ["onClick", "setRole", "handleSelect"] },
    ],
    richness_checks: [
      { check: "role-descriptions", description: "Each role has a description", markers: ["description", "Submit and track", "Review", "Full access", "manage"], severity: "warning" },
      { check: "visual-selection", description: "Selected state is visually distinct", markers: ["selected", "border-blue", "border-black", "bg-blue", "ring"], severity: "warning" },
    ],
  },

  "audit-log-page": {
    pattern_id: "audit-log-page",
    pattern_name: "Audit Log Page",
    required_sections: [
      { id: "page-header", name: "Page header", description: "Title and description", markers: ["Audit", "audit", "Trail", "trail", "Log", "log"] },
      { id: "filters", name: "Action type filters", description: "Filter by action type", markers: ["Tabs", "Tab", "filter", "All", "action"] },
      { id: "table", name: "Log entries table", description: "Table of audit events", markers: ["Table", "TableHeader", "TableBody"] },
      { id: "pagination", name: "Load more", description: "Pagination for log entries", markers: ["Load more", "more", "Next", "page"] },
    ],
    required_states: [
      { state: "loading", description: "Loading state", markers: ["LoadingState", "loading"] },
      { state: "empty", description: "No audit entries yet", markers: ["EmptyState", "No ", "no audit"] },
    ],
    required_interactions: [
      { interaction: "filter-by-action", description: "Filter by action type", markers: ["filter", "action", "setFilter", "tab"] },
    ],
    richness_checks: [
      { check: "action-badges", description: "Action types shown as badges", markers: ["Badge", "badge"], severity: "warning" },
      { check: "readable-timestamps", description: "Timestamps are human-readable", markers: ["toLocale", "Date", "ago"], severity: "warning" },
      { check: "actor-identity", description: "Shows who performed the action", markers: ["actor", "Actor", "user", "by"], severity: "warning" },
    ],
  },
};

// Map features to their expected page patterns
export const FEATURE_TO_PATTERN: Record<string, string[]> = {
  "dashboard": ["dashboard-overview"],
  "submit": ["form-page"],
  "request-submission": ["form-page"],
  "review-queue": ["data-table-page"],
  "review": ["data-table-page"],
  "approval": ["detail-page"],
  "detail": ["detail-page"],
  "audit": ["audit-log-page"],
  "audit-trail": ["audit-log-page"],
  "role": ["role-selection-page"],
  "select-role": ["role-selection-page"],
  "comment": ["detail-page"],
  "timeline": ["detail-page"],
  "notification": [],
  "state-machine": [],
  "bulk": ["data-table-page"],
};
