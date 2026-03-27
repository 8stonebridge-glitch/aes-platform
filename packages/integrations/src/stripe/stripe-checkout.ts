export interface CreateCheckoutSessionParams {
  priceId: string;
  customerId?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  trialDays?: number;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface StripeCheckoutConfig {
  apiKey: string;
  apiVersion?: string;
}

export function createStripeCheckout(_config: StripeCheckoutConfig) {
  return {
    async createSession(params: CreateCheckoutSessionParams): Promise<CheckoutSession> {
      // Stub: will be backed by Stripe SDK call via Convex action
      console.log("[stripe] createSession", params.priceId);
      return {
        id: `cs_stub_${Date.now()}`,
        url: params.successUrl,
      };
    },

    async getSession(sessionId: string): Promise<CheckoutSession | null> {
      console.log("[stripe] getSession", sessionId);
      return null;
    },
  };
}

export type StripeCheckout = ReturnType<typeof createStripeCheckout>;
