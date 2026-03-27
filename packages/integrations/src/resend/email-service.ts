export interface EmailMessage {
  to: string | string[];
  from: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface EmailServiceConfig {
  apiKey: string;
  defaultFrom?: string;
}

export interface SendEmailResult {
  id: string;
  success: boolean;
}

export function createEmailService(config: EmailServiceConfig) {
  return {
    async send(message: EmailMessage): Promise<SendEmailResult> {
      const from = message.from || config.defaultFrom;
      if (!from) {
        throw new Error("[resend] No 'from' address provided and no default configured");
      }
      // Stub: will call Resend API via Convex action
      console.log("[resend] send", { to: message.to, subject: message.subject });
      return { id: `email_stub_${Date.now()}`, success: true };
    },

    async sendBatch(messages: EmailMessage[]): Promise<SendEmailResult[]> {
      console.log(`[resend] sendBatch: ${messages.length} messages`);
      return messages.map((_, i) => ({ id: `email_stub_batch_${i}`, success: true }));
    },
  };
}

export type EmailService = ReturnType<typeof createEmailService>;
