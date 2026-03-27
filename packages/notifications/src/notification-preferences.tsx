import * as React from "react";

export interface NotificationChannel {
  id: string;
  label: string;
  enabled: boolean;
}

export interface NotificationCategory {
  id: string;
  label: string;
  description?: string;
  channels: NotificationChannel[];
}

export interface NotificationPreferencesProps {
  categories: NotificationCategory[];
  onToggle: (categoryId: string, channelId: string, enabled: boolean) => void;
  className?: string;
}

export function NotificationPreferences({
  categories,
  onToggle,
  className = "",
}: NotificationPreferencesProps) {
  return (
    <div className={`aes-notification-prefs ${className}`.trim()}>
      <h3 className="aes-notification-prefs-title">Notification Preferences</h3>
      {categories.map((category) => (
        <div key={category.id} className="aes-notification-prefs-category">
          <div className="aes-notification-prefs-category-header">
            <h4>{category.label}</h4>
            {category.description ? <p>{category.description}</p> : null}
          </div>
          <div className="aes-notification-prefs-channels">
            {category.channels.map((channel) => (
              <label key={channel.id} className="aes-notification-prefs-toggle">
                <input
                  type="checkbox"
                  checked={channel.enabled}
                  onChange={(e) => onToggle(category.id, channel.id, e.target.checked)}
                />
                <span>{channel.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
