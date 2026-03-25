"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

type View = "default" | "waiting" | "code";

export default function SubscribePage() {
  const router = useRouter();
  const [view, setView] = useState<View>("default");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/billing/status");
        const data = await res.json();
        if (data.status === "active") {
          stopPolling();
          router.replace("/");
        }
      } catch {
        // keep polling
      }
    }, 3000);
  }

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
        setView("waiting");
        startPolling();
      } else {
        setError(data.error ?? "Something went wrong");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit() {
    if (!code.trim()) return;
    setCodeLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/activate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        router.replace("/");
      } else {
        setError(data.error ?? "Invalid code");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setCodeLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: "var(--color-bg)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8 shadow-lg"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="mb-8 text-center">
          <h1
            className="mb-2 text-2xl font-semibold"
            style={{
              color: "var(--color-text)",
              fontFamily: "'Instrument Serif', serif",
            }}
          >
            Unlock AnimClaw
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Subscribe to access your AI-powered workspace
          </p>
        </div>

        {view === "waiting" ? (
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center">
              <svg
                className="animate-spin"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                style={{ color: "var(--color-accent)" }}
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
            <p className="mb-1 text-sm font-medium" style={{ color: "var(--color-text)" }}>
              Waiting for payment confirmation...
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Complete checkout in your browser, then come back here.
            </p>
            <button
              onClick={() => {
                stopPolling();
                setView("default");
              }}
              className="mt-4 text-xs underline transition-opacity hover:opacity-70"
              style={{ color: "var(--color-text-muted)" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div
              className="mb-6 rounded-xl p-6"
              style={{
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div className="mb-4 flex items-baseline justify-between">
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Pro Plan
                </span>
                <div>
                  <span
                    className="text-3xl font-bold"
                    style={{ color: "var(--color-text)" }}
                  >
                    $19
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    /month
                  </span>
                </div>
              </div>
              <ul className="space-y-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                {[
                  "Full AI workspace access",
                  "Unlimited chat sessions",
                  "CRM & sales automation",
                  "Desktop app with auto-updates",
                  "Priority support",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      style={{ color: "var(--color-success)", flexShrink: 0 }}
                    >
                      <path
                        d="M13.333 4L6 11.333 2.667 8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {error && (
              <p
                className="mb-4 text-center text-sm"
                style={{ color: "var(--color-error)" }}
              >
                {error}
              </p>
            )}

            {view === "default" && (
              <>
                <button
                  onClick={handleCheckout}
                  disabled={loading}
                  className="w-full rounded-lg px-4 py-3 text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--color-accent)", color: "#fff" }}
                >
                  {loading ? "Opening checkout..." : "Subscribe Now"}
                </button>

                <button
                  onClick={() => {
                    setError(null);
                    setView("code");
                  }}
                  className="mt-3 w-full rounded-lg px-4 py-2 text-sm transition-all hover:opacity-80"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Have a code?
                </button>
              </>
            )}

            {view === "code" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCodeSubmit();
                    }}
                    placeholder="Enter your code"
                    autoFocus
                    className="flex-1 rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-1"
                    style={{
                      background: "var(--color-bg)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                      // @ts-expect-error CSS custom prop
                      "--tw-ring-color": "var(--color-accent)",
                    }}
                  />
                  <button
                    onClick={handleCodeSubmit}
                    disabled={codeLoading || !code.trim()}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: "var(--color-accent)", color: "#fff" }}
                  >
                    {codeLoading ? "..." : "Apply"}
                  </button>
                </div>
                <button
                  onClick={() => {
                    setError(null);
                    setCode("");
                    setView("default");
                  }}
                  className="w-full text-center text-xs underline transition-opacity hover:opacity-70"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Back
                </button>
              </div>
            )}
          </>
        )}

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-3 w-full rounded-lg px-4 py-2 text-sm transition-all hover:opacity-80"
          style={{ color: "var(--color-text-muted)" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
