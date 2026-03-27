"use client";

import { useState } from "react";


interface IntentInputProps {
  onSubmit: (intent: string, targetPath?: string, deployTarget?: "local" | "cloudflare") => void;
  disabled?: boolean;
}

export function IntentInput({ onSubmit, disabled }: IntentInputProps) {
  const [text, setText] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [deployTarget, setDeployTarget] = useState<"local" | "cloudflare">("local");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed, targetPath.trim() || undefined, deployTarget);
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          What do you want to build?
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Describe your app and AES will research, plan, and build it.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) handleSubmit();
          }}
          placeholder="A project management tool with team workspaces, kanban boards, and billing..."
          disabled={disabled}
          rows={4}
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4 text-sm leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
        />

        {/* Deploy target toggle */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">Deploy to:</span>
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
            <button
              type="button"
              onClick={() => setDeployTarget("local")}
              className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                deployTarget === "local"
                  ? "bg-[var(--text-primary)] text-white"
                  : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Local files
            </button>
            <button
              type="button"
              onClick={() => setDeployTarget("cloudflare")}
              className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                deployTarget === "cloudflare"
                  ? "bg-[var(--text-primary)] text-white"
                  : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Cloudflare
            </button>
          </div>
        </div>

        {/* Advanced options toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}
            >
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
            {deployTarget === "local" ? "Output location" : "Cloudflare settings"}
          </button>

          {showAdvanced && deployTarget === "local" && (
            <div className="mt-2">
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
                Target file path
              </label>
              <input
                type="text"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                placeholder="/Users/you/projects/my-app"
                disabled={disabled}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 font-mono text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
              />
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                Where the built app files will be saved. Leave blank for a temp directory.
              </p>
            </div>
          )}

          {showAdvanced && deployTarget === "cloudflare" && (
            <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-[11px] text-[var(--text-secondary)]">
                Your app will be deployed to Cloudflare Dynamic Workers and you'll get a live preview URL.
                Auth is handled via Cloudflare Access, data via D1 (SQLite at the edge).
              </p>
              <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                Requires AES_CF_API_TOKEN and AES_CF_ACCOUNT_ID to be configured on the server.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">
            ⌘ Enter to start
          </span>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || disabled}
            className="rounded-lg bg-[var(--text-primary)] px-6 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
