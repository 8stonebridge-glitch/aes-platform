import * as React from "react";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  avatar?: string;
  category?: string;
}

export interface InboxProps {
  notifications: NotificationItem[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClick?: (notification: NotificationItem) => void;
  emptyMessage?: string;
  className?: string;
}

export function Inbox({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onClick,
  emptyMessage = "No notifications",
  className = "",
}: InboxProps) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className={`aes-inbox ${className}`.trim()}>
      <div className="aes-inbox-header">
        <h3 className="aes-inbox-title">
          Notifications
          {unreadCount > 0 ? <span className="aes-inbox-badge">{unreadCount}</span> : null}
        </h3>
        {unreadCount > 0 ? (
          <button className="aes-inbox-mark-all" onClick={onMarkAllRead}>
            Mark all read
          </button>
        ) : null}
      </div>
      <div className="aes-inbox-list" role="list">
        {notifications.length === 0 ? (
          <div className="aes-inbox-empty">{emptyMessage}</div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`aes-inbox-item ${notification.read ? "" : "aes-inbox-item-unread"}`}
              role="listitem"
              onClick={() => {
                if (!notification.read) onMarkRead(notification.id);
                onClick?.(notification);
              }}
            >
              {notification.avatar ? (
                <img className="aes-inbox-avatar" src={notification.avatar} alt="" />
              ) : null}
              <div className="aes-inbox-content">
                <p className="aes-inbox-item-title">{notification.title}</p>
                <p className="aes-inbox-item-body">{notification.body}</p>
                <time className="aes-inbox-item-time">{notification.createdAt}</time>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
