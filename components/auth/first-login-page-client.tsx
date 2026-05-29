"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function FirstLoginPageClient() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  const isDevelopment =
    (process.env.NODE_ENV || "production") === "development";

  useEffect(() => {
    if (isDevelopment) return;

    const handleTurnstileSuccess = (captchaToken: string) => {
      setTurnstileToken(captchaToken);
    };

    const handleTurnstileError = () => {
      setTurnstileToken(null);
    };

    const handleTurnstileExpired = () => {
      setTurnstileToken(null);
    };

    const initTurnstile = () => {
      if (window.turnstile && turnstileRef.current) {
        turnstileWidgetIdRef.current = window.turnstile.render(
          turnstileRef.current,
          {
            sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
            callback: handleTurnstileSuccess,
            "error-callback": handleTurnstileError,
            "expired-callback": handleTurnstileExpired,
            theme: "dark",
          },
        );
      }
    };

    if (window.turnstile) {
      initTurnstile();

      return () => {
        if (turnstileWidgetIdRef.current && window.turnstile) {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        }
      };
    }

    const checkTurnstile = setInterval(() => {
      if (window.turnstile) {
        clearInterval(checkTurnstile);
        initTurnstile();
      }
    }, 100);

    const timeoutId = window.setTimeout(() => {
      clearInterval(checkTurnstile);
    }, 10000);

    return () => {
      clearInterval(checkTurnstile);
      window.clearTimeout(timeoutId);

      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
      }
    };
  }, [isDevelopment]);

  const resetCaptcha = () => {
    if (turnstileWidgetIdRef.current && window.turnstile) {
      window.turnstile.reset(turnstileWidgetIdRef.current);
      setTurnstileToken(null);
    }
  };

  const passwordRequirements = [
    { text: "At least 8 characters", met: newPassword.length >= 8 },
    { text: "Contains uppercase letter", met: /[A-Z]/.test(newPassword) },
    { text: "Contains lowercase letter", met: /[a-z]/.test(newPassword) },
    { text: "Contains number", met: /[0-9]/.test(newPassword) },
    {
      text: "Contains special character",
      met: /[^A-Za-z0-9]/.test(newPassword),
    },
    {
      text: "Passwords match",
      met: newPassword === confirmPassword && newPassword.length > 0,
    },
  ];

  const allRequirementsMet = passwordRequirements.every((requirement) =>
    requirement.met,
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!allRequirementsMet) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          turnstileToken: isDevelopment ? "dev-bypass" : turnstileToken,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push("/dashboard");
        return;
      }

      setError(data.error || "Failed to change password");
      resetCaptcha();
    } catch {
      setError("An unexpected error occurred");
      resetCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-terminal-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex items-center justify-center mb-3 sm:mb-4">
            <Terminal className="h-10 w-10 sm:h-12 sm:w-12 text-terminal-green" />
          </div>
          <h1 className="font-mono text-xl sm:text-2xl font-bold text-terminal-green terminal-glow mb-2">
            $ first-login --required
          </h1>
          <p className="font-mono text-sm text-terminal-text-muted">
            Set a new secure password
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Password Change Required
            </CardTitle>
            <CardDescription>
              Create a strong password for your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg border border-destructive bg-destructive/10 text-destructive text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-mono text-terminal-text-muted">
                  Current Password
                </label>
                <Input
                  type="password"
                  placeholder="$ ••••••••"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-mono text-terminal-text-muted">
                  New Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="$ ••••••••"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-terminal-text-muted hover:text-terminal-green transition-colors p-1.5 touch-manipulation"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-mono text-terminal-text-muted">
                  Confirm Password
                </label>
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="$ ••••••••"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="rounded-md bg-terminal-darker/80 border border-terminal-green/20 p-4 space-y-2">
                <p className="font-mono text-xs text-terminal-text-muted mb-2">
                  Password Requirements:
                </p>
                {passwordRequirements.map((requirement) => (
                  <div
                    key={requirement.text}
                    className="flex items-center gap-2 font-mono text-xs"
                  >
                    {requirement.met ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-terminal-green" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-terminal-text-muted" />
                    )}
                    <span
                      className={
                        requirement.met
                          ? "text-terminal-green"
                          : "text-terminal-text-muted"
                      }
                    >
                      {requirement.text}
                    </span>
                  </div>
                ))}
              </div>

              {!isDevelopment && (
                <div className="space-y-2">
                  <div ref={turnstileRef} />
                </div>
              )}

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={
                  !allRequirementsMet ||
                  isLoading ||
                  (!isDevelopment && !turnstileToken)
                }
              >
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-terminal-dark border-t-transparent rounded-full animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Set Password &amp; Continue
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-4 rounded-md bg-terminal-darker/50 border border-terminal-green/10 p-3 font-mono text-xs text-terminal-text-muted">
          <p>
            <span className="text-terminal-green">$</span> Your password will be
            securely hashed and stored
          </p>
        </div>
      </div>
    </div>
  );
}
