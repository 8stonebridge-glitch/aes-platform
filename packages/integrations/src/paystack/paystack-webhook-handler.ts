export interface PaystackWebhookEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface PaystackWebhookConfig {
  secretKey: string;
  onChargeSuccess?: (data: Record<string, unknown>) => Promise<void>;
  onSubscriptionCreate?: (data: Record<string, unknown>) => Promise<void>;
  onSubscriptionDisable?: (data: Record<string, unknown>) => Promise<void>;
  onTransferSuccess?: (data: Record<string, unknown>) => Promise<void>;
  onTransferFailed?: (data: Record<string, unknown>) => Promise<void>;
}

export function createPaystackWebhookHandler(config: PaystackWebhookConfig) {
  return async function handleWebhook(event: PaystackWebhookEvent): Promise<{ handled: boolean }> {
    switch (event.event) {
      case "charge.success":
        await config.onChargeSuccess?.(event.data);
        return { handled: true };
      case "subscription.create":
        await config.onSubscriptionCreate?.(event.data);
        return { handled: true };
      case "subscription.disable":
        await config.onSubscriptionDisable?.(event.data);
        return { handled: true };
      case "transfer.success":
        await config.onTransferSuccess?.(event.data);
        return { handled: true };
      case "transfer.failed":
        await config.onTransferFailed?.(event.data);
        return { handled: true };
      default:
        console.log(`[paystack] Unhandled event: ${event.event}`);
        return { handled: false };
    }
  };
}
