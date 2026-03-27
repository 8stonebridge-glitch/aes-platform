import * as React from "react";

export interface AuthLayoutProps {
  children: React.ReactNode;
  brandLogo?: React.ReactNode;
  brandName?: string;
  backgroundPanel?: React.ReactNode;
  className?: string;
}

export function AuthLayout({
  children,
  brandLogo,
  brandName = "AES",
  backgroundPanel,
  className = "",
}: AuthLayoutProps) {
  return (
    <div className={`aes-layout-auth ${className}`.trim()}>
      <div className="aes-layout-auth-panel">
        {backgroundPanel ?? (
          <div className="aes-layout-auth-brand">
            {brandLogo}
            <h1 className="aes-layout-auth-brand-name">{brandName}</h1>
          </div>
        )}
      </div>
      <div className="aes-layout-auth-form">
        <div className="aes-layout-auth-form-inner">{children}</div>
      </div>
    </div>
  );
}
