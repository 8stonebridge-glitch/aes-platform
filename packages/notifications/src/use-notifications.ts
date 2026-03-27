import { useState, useCallback } from "react";
import { type NotificationItem } from "./inbox.js";

export interface UseNotificationsReturn {
  notifications: NotificationItem[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  addNotification: (notification: NotificationItem) => void;
  removeNotification: (id: string) => void;
}

/**
 * Hook for managing notification state.
 * In production, this will be backed by Convex real-time queries.
 */
export function useNotifications(
  initialNotifications: NotificationItem[] = []
): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const addNotification = useCallback((notification: NotificationItem) => {
    setNotifications((prev) => [notification, ...prev]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    addNotification,
    removeNotification,
  };
}
