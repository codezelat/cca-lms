"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LoginPageClientProps = {
  initialCallbackUrl: string;
};

export default function LoginPageClient({
  initialCallbackUrl,
}: LoginPageClientProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

    const handleTurnstileSuccess = (token: string) => {
      setTurnstileToken(token);
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
    } else {
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
    }

    return () => {
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        turnstileToken: isDevelopment ? "dev-bypass" : turnstileToken,
        callbackUrl: initialCallbackUrl,
        redirect: false,
      });

      if (result?.error) {
        const errorMessages: Record<string, string> = {
          CredentialsSignin: "Invalid email or password",
          "Invalid credentials": "Invalid email or password",
          "Account is not active": "Your account has been disabled",
          "CAPTCHA verification required":
            "Please complete the CAPTCHA verification",
          "CAPTCHA verification failed":
            "CAPTCHA verification failed. Please try again.",
          "Email and password required": "Please enter email and password",
          Configuration: "Invalid email or password",
          AccessDenied: "Access denied",
          Verification: "Unable to sign in",
          Default: "Invalid email or password",
        };

        const friendlyError =
          errorMessages[result.error] || "Invalid email or password";
        setError(friendlyError);
        resetCaptcha();
        setIsLoading(false);
        return;
      }

      if (result?.ok) {
        window.location.href = initialCallbackUrl;
        return;
      }

      setError("Invalid email or password");
      resetCaptcha();
      setIsLoading(false);
    } catch (err) {
      console.error("Login error:", err);
      setError("An unexpected error occurred. Please try again.");
      resetCaptcha();
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-terminal-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex items-center justify-center mb-3 sm:mb-4">
            <div className="relative">
              <Terminal className="h-12 w-12 sm:h-16 sm:w-16 text-terminal-green" />
              <div className="absolute inset-0 animate-ping opacity-20">
                <Terminal className="h-12 w-12 sm:h-16 sm:w-16 text-terminal-green" />
              </div>
            </div>
          </div>
          <h1 className="font-mono text-2xl sm:text-3xl font-bold text-terminal-green terminal-glow mb-2">
            $ cca-lms --login
          </h1>
          <p className="font-mono text-sm text-terminal-text-muted">
            Internal Learning Management System
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Authentication Required
            </CardTitle>
            <CardDescription>
              Enter your credentials to access the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm font-mono text-red-500">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-mono text-terminal-text-muted flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Address
                </label>
                <Input
                  type="email"
                  placeholder="$ user@cca.edu"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-mono text-terminal-text-muted flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="$ ••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-terminal-text-muted hover:text-terminal-green transition-colors p-1.5 touch-manipulation"
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link
                  href="/auth/reset-password"
                  className="text-sm font-mono text-terminal-green hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              {!isDevelopment && (
                <div className="space-y-2">
                  <div ref={turnstileRef} />
                </div>
              )}

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={isLoading || (!isDevelopment && !turnstileToken)}
              >
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-terminal-dark border-t-transparent rounded-full animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 rounded-md bg-terminal-darker/80 border border-terminal-green/20 p-3 font-mono text-xs space-y-1">
              <p className="text-terminal-text-muted">
                <span className="text-terminal-green">$</span> Status: Awaiting
                credentials
              </p>
              <p className="text-terminal-text-muted">
                <span className="text-terminal-green">$</span> Session: Inactive
              </p>
              <p className="text-terminal-text-muted">
                <span className="text-terminal-green">$</span> Security: TLS 1.3
                enabled
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs font-mono text-terminal-text-muted">
          No account? Contact your administrator
        </p>
      </div>
    </div>
  );
}
