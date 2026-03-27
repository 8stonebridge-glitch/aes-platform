export interface NotificationPayload {
  subscriberId: string;
  templateId: string;
  payload: Record<string, unknown>;
  overrides?: {
    email?: Record<string, unknown>;
    sms?: Record<string, unknown>;
    push?: Record<string, unknown>;
    inApp?: Record<string, unknown>;
  };
}

export interface NotificationServiceConfig {
  apiKey: string;
  applicationIdentifier: string;
}

export interface TriggerResult {
  transactionId: string;
  acknowledged: boolean;
}

export function createNotificationService(config: NotificationServiceConfig) {
  return {
    async trigger(notification: NotificationPayload): Promise<TriggerResult> {
      console.log("[novu] trigger", {
        template: notification.templateId,
        subscriber: notification.subscriberId,
        app: config.applicationIdentifier,
      });
      return {
        transactionId: `novu_tx_${Date.now()}`,
        acknowledged: true,
      };
    },

    async triggerBulk(notifications: NotificationPayload[]): Promise<TriggerResult[]> {
      console.log(`[novu] triggerBulk: ${notifications.length} notifications`);
      return notifications.map(() => ({
        transactionId: `novu_tx_${Date.now()}`,
        acknowledged: true,
      }));
    },

    async identifySubscriber(subscriberId: string, data: Record<string, unknown>): Promise<void> {
      console.log("[novu] identifySubscriber", subscriberId, data);
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
