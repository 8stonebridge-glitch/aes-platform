import { type AuditEvent, validateAuditEvent } from "./audit-event-schema.js";

export interface AuditLogConfig {
  persist: (event: AuditEvent) => Promise<void>;
  onError?: (error: Error, event: AuditEvent) => void;
}

let _config: AuditLogConfig | null = null;

export function configureAuditLog(config: AuditLogConfig): void {
  _config = config;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const errors = validateAuditEvent(event);
  if (errors.length > 0) {
    console.error("[audit] Invalid event:", errors);
    throw new Error(`Invalid audit event: ${errors.join(", ")}`);
  }

  if (_config) {
    try {
      await _config.persist(event);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      _config.onError?.(error, event);
      throw error;
    }
  } else {
    // Fallback: log to console when no persistence is configured
    console.log("[audit]", event.action, event.resource_type, event.resource_id);
  }
}
