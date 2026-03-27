export interface AuthContext {
  userId: string;
  orgId: string;
  role: "owner" | "admin" | "member" | "viewer";
  sessionId: string;
}

export interface AuthMiddlewareConfig {
  getToken: () => string | null;
  onUnauthorized?: () => void;
  onForbidden?: () => void;
}

export function createAuthMiddleware(config: AuthMiddlewareConfig) {
  return {
    getAuthHeaders(): Record<string, string> {
      const token = config.getToken();
      if (!token) return {};
      return { Authorization: `Bearer ${token}` };
    },

    handleAuthError(status: number): void {
      if (status === 401) {
        config.onUnauthorized?.();
      } else if (status === 403) {
        config.onForbidden?.();
      }
    },

    isAuthenticated(): boolean {
      return config.getToken() !== null;
    },
  };
}

export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
