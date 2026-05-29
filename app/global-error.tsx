"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <title>Application error</title>
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0f0a",
          color: "#e5e7eb",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            padding: 32,
            border: "1px solid rgba(34, 197, 94, 0.2)",
            borderRadius: 12,
            background: "rgba(10, 15, 10, 0.9)",
          }}
        >
          <h1 style={{ marginTop: 0, marginBottom: 12 }}>$ error --fatal</h1>
          <p style={{ marginTop: 0, marginBottom: 16 }}>
            Something went wrong. Please try again.
          </p>
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            <p style={{ margin: 0 }}>
              The request could not be completed. Retry the action or return to
              the home page.
            </p>
            {error.digest ? (
              <p style={{ margin: "12px 0 0", fontFamily: "monospace" }}>
                Error ID: {error.digest}
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(34, 197, 94, 0.4)",
                background: "#22c55e",
                color: "#0a0f0a",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(34, 197, 94, 0.4)",
                background: "transparent",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              Go home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
