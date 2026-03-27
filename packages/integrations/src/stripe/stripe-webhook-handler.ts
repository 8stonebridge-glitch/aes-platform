export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
  created: number;
  livemode: boolean;
}

export interface StripeWebhookConfig {
  webhookSecret: string;
  onCheckoutCompleted?: (session: Record<string, unknown>) => Promise<void>;
  onSubscriptionUpdated?: (subscription: Record<string, unknown>) => Promise<void>;
  onSubscriptionDeleted?: (subscription: Record<string, unknown>) => Promise<void>;
  onInvoicePaid?: (invoice: Record<string, unknown>) => Promise<void>;
  onPaymentFailed?: (invoice: Record<string, unknown>) => Promise<void>;
}

export function createStripeWebhookHandler(config: StripeWebhookConfig) {
  return async function handleWebhook(event: StripeWebhookEvent): Promise<{ handled: boolean }> {
    switch (event.type) {
      case "checkout.session.completed":
        await config.onCheckoutCompleted?.(event.data.object);
        return { handled: true };
      case "customer.subscription.updated":
        await config.onSubscriptionUpdated?.(event.data.object);
        return { handled: true };
      case "customer.subscription.deleted":
        await config.onSubscriptionDeleted?.(event.data.object);
        return { handled: true };
      case "invoice.paid":
        await config.onInvoicePaid?.(event.data.object);
        return { handled: true };
      case "invoice.payment_failed":
        await config.onPaymentFailed?.(event.data.object);
        return { handled: true };
      default:
        console.log(`[stripe] Unhandled event type: ${event.type}`);
        return { handled: false };
    }
  };
}
