import * as React from "react";
import { type AuditEvent } from "./audit-event-schema.js";

export interface AuditLogViewerProps {
  events: AuditEvent[];
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  className?: string;
}

export function AuditLogViewer({
  events,
  loading = false,
  onLoadMore,
  hasMore = false,
  className = "",
}: AuditLogViewerProps) {
  return (
    <div className={`aes-audit-viewer ${className}`.trim()}>
      <table className="aes-table">
        <thead>
          <tr>
            <th className="aes-table-th">Time</th>
            <th className="aes-table-th">Action</th>
            <th className="aes-table-th">Actor</th>
            <th className="aes-table-th">Resource</th>
            <th className="aes-table-th">Details</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, index) => (
            <tr key={event.id ?? index} className="aes-table-row">
              <td className="aes-table-td">
                <time>{event.timestamp}</time>
              </td>
              <td className="aes-table-td">
                <span className="aes-badge aes-badge-neutral">{event.action}</span>
              </td>
              <td className="aes-table-td">{event.actor_id}</td>
              <td className="aes-table-td">
                {event.resource_type}/{event.resource_id}
              </td>
              <td className="aes-table-td">
                {event.metadata ? (
                  <code className="aes-audit-meta">
                    {JSON.stringify(event.metadata)}
                  </code>
                ) : (
                  <span className="aes-text-muted">--</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading ? <div className="aes-audit-loading">Loading...</div> : null}
      {!loading && hasMore && onLoadMore ? (
        <button className="aes-btn aes-btn-ghost aes-btn-sm" onClick={onLoadMore}>
          Load more
        </button>
      ) : null}
    </div>
  );
}
