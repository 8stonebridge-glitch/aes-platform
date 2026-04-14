/**
 * Clerk Admin User Creation
 *
 * Creates a Clerk user account via the Backend API.
 * Used when an admin creates accounts directly instead of sending invitation emails.
 *
 * @see https://clerk.com/docs/reference/backend-api/tag/Users#operation/CreateUser
 *
 * GOTCHAS:
 * 1. email_address MUST be an array, not a string
 * 2. skip_password_checks MUST be true — Clerk's breach detection silently
 *    rejects common passwords and returns a 422 with code "form_password_pwned"
 * 3. The created user has no session — they must sign in with the credentials
 * 4. If using Convex, the user record is created on first login via syncUser,
 *    NOT during this call
 */

export interface CreateUserParams {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  skipPasswordChecks?: boolean;
  publicMetadata?: Record<string, unknown>;
}

export interface CreateUserResult {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: number;
}

export interface ClerkAdminConfig {
  secretKey: string;
  baseUrl?: string;
}

export async function createClerkUser(
  config: ClerkAdminConfig,
  params: CreateUserParams
): Promise<CreateUserResult> {
  const baseUrl = config.baseUrl ?? "https://api.clerk.com";

  const response = await fetch(`${baseUrl}/v1/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email_address: [params.email], // MUST be array
      password: params.password,
      first_name: params.firstName,
      last_name: params.lastName,
      skip_password_checks: params.skipPasswordChecks ?? true,
      public_metadata: params.publicMetadata,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    let message = `Clerk API error ${response.status}`;
    try {
      const parsed = JSON.parse(body);
      const errors = parsed.errors ?? [];
      if (errors.length > 0) {
        message = errors.map((e: any) => e.long_message ?? e.message).join("; ");
      }
    } catch {
      message += `: ${body}`;
    }
    throw new Error(message);
  }

  const user = await response.json();
  return {
    id: user.id,
    email: user.email_addresses?.[0]?.email_address ?? params.email,
    firstName: user.first_name,
    lastName: user.last_name,
    createdAt: user.created_at,
  };
}

/**
 * Delete a Clerk user by ID. Used for cleanup if downstream steps fail.
 */
export async function deleteClerkUser(
  config: ClerkAdminConfig,
  userId: string
): Promise<void> {
  const baseUrl = config.baseUrl ?? "https://api.clerk.com";

  const response = await fetch(`${baseUrl}/v1/users/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to delete Clerk user ${userId}: ${response.status} ${body}`);
  }
}
