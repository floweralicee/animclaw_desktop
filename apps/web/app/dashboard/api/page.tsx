"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type ApiKey = {
  id: string;
  key_prefix: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

type ModelUsage = {
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicrocents: number;
  requestCount: number;
};

type UsageSummary = {
  totalTokens: number;
  totalCostMicrocents: number;
  byModel: ModelUsage[];
};

function formatCost(microcents: number): string {
  return `$${(microcents / 1_000_000).toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ApiDashboardPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway/keys");
      const data = await res.json();
      setKeys(data.keys ?? []);
      return data.keys ?? [];
    } catch {
      setError("Failed to load API keys");
      return [];
    }
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway/usage");
      const data = await res.json();
      setUsage(data);
    } catch {
      setError("Failed to load usage data");
    }
  }, []);

  useEffect(() => {
    async function init() {
      const [currentKeys] = await Promise.all([fetchKeys(), fetchUsage()]);
      const hasActive = currentKeys.some((k: ApiKey) => !k.revoked_at);
      if (!hasActive) {
        try {
          const res = await fetch("/api/gateway/keys/ensure", { method: "POST" });
          const data = await res.json();
          if (data.created && data.key) {
            setCreatedKey(data.key);
            fetchKeys();
          }
        } catch {
          // silent — user can still create manually
        }
      }
    }
    init();
  }, [fetchKeys, fetchUsage]);

  async function handleCreateKey() {
    setLoading(true);
    setError(null);
    setCreatedKey(null);
    try {
      const res = await fetch("/api/gateway/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() || "Default" }),
      });
      const data = await res.json();
      if (data.key) {
        setCreatedKey(data.key);
        setNewKeyName("");
        fetchKeys();
      } else {
        setError(data.error ?? "Failed to create key");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevokeKey(id: string) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    try {
      await fetch(`/api/gateway/keys/${id}`, { method: "DELETE" });
      fetchKeys();
    } catch {
      setError("Failed to revoke key");
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => k.revoked_at);

  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1
              className="text-3xl font-semibold"
              style={{
                color: "var(--color-text)",
                fontFamily: "'Instrument Serif', serif",
              }}
            >
              API Dashboard
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Manage your Animclaw API keys and monitor usage
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-all hover:opacity-80"
            style={{ color: "var(--color-text-muted)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
            Sign out
          </button>
        </div>

        {error && (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{ background: "var(--color-error-bg, #fef2f2)", color: "var(--color-error)" }}
          >
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 underline hover:opacity-70"
            >
              dismiss
            </button>
          </div>
        )}

        {/* Quick Start */}
        <Section title="Quick Start">
          <div
            className="rounded-lg p-4 text-sm font-mono"
            style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            <p style={{ color: "var(--color-text-muted)" }}>
              # Use any OpenAI-compatible client
            </p>
            <p>curl https://animclaw.com/api/v1/chat/completions \</p>
            <p className="pl-4">-H &quot;Authorization: Bearer ac_YOUR_KEY&quot; \</p>
            <p className="pl-4">-H &quot;Content-Type: application/json&quot; \</p>
            <p className="pl-4">
              -d &apos;{`{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}`}&apos;
            </p>
          </div>
        </Section>

        {/* API Keys */}
        <Section title="API Keys">
          {/* Key creation */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label
                className="mb-1 block text-xs font-medium"
                style={{ color: "var(--color-text-muted)" }}
              >
                Key name (optional)
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Production, Development"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-1"
                style={{
                  background: "var(--color-bg)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              />
            </div>
            <button
              onClick={handleCreateKey}
              disabled={loading}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--color-accent)", color: "#fff" }}
            >
              {loading ? "Creating..." : "Create Key"}
            </button>
          </div>

          {/* Newly created key (show once) */}
          {createdKey && (
            <div
              className="mt-4 rounded-lg p-4"
              style={{
                background: "var(--color-success-bg, #f0fdf4)",
                border: "1px solid var(--color-success, #22c55e)",
              }}
            >
              <p className="mb-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
                Your new API key (copy it now -- it won&apos;t be shown again):
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 rounded bg-white/50 px-3 py-2 text-sm break-all"
                  style={{ color: "var(--color-text)" }}
                >
                  {createdKey}
                </code>
                <button
                  onClick={() => handleCopy(createdKey)}
                  className="rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:opacity-80"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {/* Active keys */}
          {activeKeys.length > 0 && (
            <div className="mt-4 space-y-2">
              {activeKeys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between rounded-lg px-4 py-3"
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div>
                    <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                      {k.name}
                    </span>
                    <span
                      className="ml-2 font-mono text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {k.key_prefix}...
                    </span>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      Created {formatDate(k.created_at)}
                      {k.last_used_at && ` · Last used ${formatDate(k.last_used_at)}`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevokeKey(k.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
                    style={{ color: "var(--color-error)" }}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeKeys.length === 0 && !createdKey && (
            <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
              No active API keys. Create one to get started.
            </p>
          )}

          {revokedKeys.length > 0 && (
            <details className="mt-4">
              <summary
                className="cursor-pointer text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                {revokedKeys.length} revoked key{revokedKeys.length > 1 ? "s" : ""}
              </summary>
              <div className="mt-2 space-y-2">
                {revokedKeys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between rounded-lg px-4 py-3 opacity-50"
                    style={{
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div>
                      <span className="text-sm font-medium line-through" style={{ color: "var(--color-text)" }}>
                        {k.name}
                      </span>
                      <span className="ml-2 font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {k.key_prefix}...
                      </span>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        Revoked {k.revoked_at ? formatDate(k.revoked_at) : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Section>

        {/* Usage */}
        <Section title="Usage This Month">
          {usage ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Total Tokens" value={formatTokens(usage.totalTokens)} />
                <StatCard label="Estimated Cost" value={formatCost(usage.totalCostMicrocents)} />
              </div>

              {usage.byModel.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-lg" style={{ border: "1px solid var(--color-border)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "var(--color-bg)", borderBottom: "1px solid var(--color-border)" }}>
                        <th className="px-4 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>
                          Model
                        </th>
                        <th className="px-4 py-2 text-right font-medium" style={{ color: "var(--color-text-muted)" }}>
                          Requests
                        </th>
                        <th className="px-4 py-2 text-right font-medium" style={{ color: "var(--color-text-muted)" }}>
                          Tokens
                        </th>
                        <th className="px-4 py-2 text-right font-medium" style={{ color: "var(--color-text-muted)" }}>
                          Cost
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.byModel.map((m) => (
                        <tr
                          key={m.model}
                          style={{ borderBottom: "1px solid var(--color-border)" }}
                        >
                          <td className="px-4 py-2" style={{ color: "var(--color-text)" }}>
                            <span className="font-mono text-xs">{m.model}</span>
                            <span
                              className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase"
                              style={{
                                background: m.provider === "openai" ? "#e0f2fe" : "#fae8ff",
                                color: m.provider === "openai" ? "#0369a1" : "#a21caf",
                              }}
                            >
                              {m.provider}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--color-text-secondary)" }}>
                            {m.requestCount}
                          </td>
                          <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--color-text-secondary)" }}>
                            {formatTokens(m.totalTokens)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--color-text-secondary)" }}>
                            {formatCost(m.costMicrocents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {usage.byModel.length === 0 && (
                <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
                  No API usage this month yet.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Loading usage data...
            </p>
          )}
        </Section>

        {/* Available Models */}
        <Section title="Available Models">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { id: "gpt-4o", provider: "openai" },
              { id: "gpt-4o-mini", provider: "openai" },
              { id: "gpt-4.1", provider: "openai" },
              { id: "gpt-4.1-mini", provider: "openai" },
              { id: "gpt-4.1-nano", provider: "openai" },
              { id: "o3", provider: "openai" },
              { id: "o3-mini", provider: "openai" },
              { id: "o4-mini", provider: "openai" },
              { id: "claude-sonnet-4-20250514", provider: "anthropic" },
              { id: "claude-4-opus-20250514", provider: "anthropic" },
              { id: "claude-3.5-sonnet-20241022", provider: "anthropic" },
              { id: "claude-3.5-haiku-20241022", provider: "anthropic" },
            ].map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg px-3 py-2"
                style={{
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <span className="font-mono text-xs" style={{ color: "var(--color-text)" }}>
                  {m.id}
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase"
                  style={{
                    background: m.provider === "openai" ? "#e0f2fe" : "#fae8ff",
                    color: m.provider === "openai" ? "#0369a1" : "#a21caf",
                  }}
                >
                  {m.provider}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <h2
        className="mb-4 text-lg font-semibold"
        style={{ color: "var(--color-text)" }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
      }}
    >
      <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color: "var(--color-text)" }}>
        {value}
      </p>
    </div>
  );
}
