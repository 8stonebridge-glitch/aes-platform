import { type AuthContext } from "./auth-middleware.js";

export interface UseAuthReturn {
  user: AuthContext | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (token: string) => void;
  signOut: () => void;
}

/**
 * Auth hook stub. In production, this will be backed by Clerk or a similar
 * auth provider integrated with Convex.
 *
 * Consumers should wrap their app with an AuthProvider that supplies
 * the actual implementation.
 */
export function useAuth(): UseAuthReturn {
  // Stub implementation — will be replaced by provider-backed hook
  return {
    user: null,
    isLoading: false,
    isAuthenticated: false,
    signIn: (_token: string) => {
      console.warn("[auth] useAuth.signIn called on stub implementation");
    },
    signOut: () => {
      console.warn("[auth] useAuth.signOut called on stub implementation");
    },
  };
}
