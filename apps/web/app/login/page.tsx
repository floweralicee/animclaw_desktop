"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: "var(--color-bg)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-lg"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="mb-8 text-center">
          <h1
            className="mb-2 text-2xl font-semibold"
            style={{ color: "var(--color-text)", fontFamily: "'Instrument Serif', serif" }}
          >
            Welcome to AnimClaw
          </h1>
          <p
            className="text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            Sign in to access your workspace
          </p>
        </div>

        <button
          onClick={() =>
            signIn("google", { callbackUrl: "/dashboard/api" }, { prompt: "select_account" })
          }
          className="flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:opacity-90"
          style={{
            background: "var(--color-accent)",
            color: "#fff",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
              fill="#fff"
              fillOpacity={0.8}
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
              fill="#fff"
              fillOpacity={0.9}
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9s.957 2.732.957 4.042l3.007-2.332z"
              fill="#fff"
              fillOpacity={0.7}
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              fill="#fff"
              fillOpacity={0.85}
            />
          </svg>
          Sign in with Google
        </button>

        <p
          className="mt-6 text-center text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          By signing in, you agree to our Terms of Service
        </p>
        <p
          className="mt-2 text-center text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          Want to use a different account? Click the button above to choose.
        </p>
      </div>
    </div>
  );
}
