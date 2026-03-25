"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CheckoutResult() {
  const params = useSearchParams();
  const status = params.get("status");
  const cancelled = status === "cancelled";

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: "var(--color-bg, #f5f5f5)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center shadow-lg"
        style={{
          background: "var(--color-surface, #fff)",
          border: "1px solid var(--color-border, #e5e5e5)",
        }}
      >
        {cancelled ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--color-bg, #f5f5f5)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--color-text-muted, #888)" }}>
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1
              className="mb-2 text-xl font-semibold"
              style={{ color: "var(--color-text, #111)", fontFamily: "'Instrument Serif', serif" }}
            >
              Checkout Cancelled
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted, #888)" }}>
              You can close this tab and return to AnimClaw to try again.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--color-bg, #f5f5f5)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--color-success, #22c55e)" }}>
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1
              className="mb-2 text-xl font-semibold"
              style={{ color: "var(--color-text, #111)", fontFamily: "'Instrument Serif', serif" }}
            >
              Payment Complete
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted, #888)" }}>
              You can close this tab and return to AnimClaw. Your subscription is being activated.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckoutCompletePage() {
  return (
    <Suspense>
      <CheckoutResult />
    </Suspense>
  );
}
