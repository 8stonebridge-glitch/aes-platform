import * as React from "react";

export type Role = "owner" | "admin" | "member" | "viewer";

export interface RoleGuardProps {
  children: React.ReactNode;
  requiredRole: Role | Role[];
  currentRole: Role;
  fallback?: React.ReactNode;
}

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 40,
  admin: 30,
  member: 20,
  viewer: 10,
};

export function hasRole(currentRole: Role, requiredRole: Role | Role[]): boolean {
  const required = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const currentLevel = ROLE_HIERARCHY[currentRole];
  return required.some((r) => currentLevel >= ROLE_HIERARCHY[r]);
}

export function RoleGuard({ children, requiredRole, currentRole, fallback = null }: RoleGuardProps) {
  if (!hasRole(currentRole, requiredRole)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
