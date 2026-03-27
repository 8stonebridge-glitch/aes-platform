import * as React from "react";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
}

export interface OrgSwitcherProps {
  organizations: Organization[];
  currentOrgId: string;
  onSwitch: (orgId: string) => void;
  className?: string;
}

export function OrgSwitcher({ organizations, currentOrgId, onSwitch, className = "" }: OrgSwitcherProps) {
  const currentOrg = organizations.find((o) => o.id === currentOrgId);

  return (
    <div className={`aes-org-switcher ${className}`.trim()}>
      <select
        className="aes-org-switcher-select"
        value={currentOrgId}
        onChange={(e) => onSwitch(e.target.value)}
        aria-label="Switch organization"
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      {currentOrg ? (
        <span className="aes-org-switcher-current" aria-hidden="true">
          {currentOrg.name}
        </span>
      ) : null}
    </div>
  );
}
