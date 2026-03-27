export interface AuditEvent {
  id?: string;
  action: string;
  actor_id: string;
  actor_type: "user" | "system" | "api_key";
  resource_type: string;
  resource_id: string;
  org_id: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
}

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "archive"
  | "restore"
  | "invite"
  | "remove"
  | "login"
  | "logout"
  | "export"
  | "import"
  | "approve"
  | "reject"
  | "transition";

export type AuditResourceType =
  | "user"
  | "organization"
  | "project"
  | "document"
  | "workflow"
  | "subscription"
  | "api_key"
  | "settings";

export function createAuditEvent(
  params: Omit<AuditEvent, "timestamp" | "id">
): AuditEvent {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}

export function validateAuditEvent(event: Partial<AuditEvent>): string[] {
  const errors: string[] = [];
  if (!event.action) errors.push("action is required");
  if (!event.actor_id) errors.push("actor_id is required");
  if (!event.resource_type) errors.push("resource_type is required");
  if (!event.resource_id) errors.push("resource_id is required");
  if (!event.org_id) errors.push("org_id is required");
  return errors;
}
