"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

type ThemeProviderProps = React.ComponentPropsWithoutRef<
  typeof NextThemesProvider
>;

function ToasterWithTheme() {
  const { theme } = useTheme();

  // Determine if current theme is dark
  const isDark = theme?.includes("dark") || theme === "dark";

  return (
    <Toaster
      position="top-right"
      richColors
      expand={true}
      duration={4000}
      closeButton
      theme={isDark ? "dark" : "light"}
      toastOptions={{
        classNames: {
          toast: "font-mono backdrop-blur-sm",
          title: "font-semibold text-base",
          description: "text-sm opacity-90 mt-1",
          error: "border-red-500/30 bg-red-500/10",
          success: "border-terminal-green/30 bg-terminal-green/10",
          warning: "border-yellow-500/30 bg-yellow-500/10",
          info: "border-blue-500/30 bg-blue-500/10",
          closeButton: "hover:bg-terminal-green/20",
        },
      }}
    />
  );
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="dark"
      themes={[
        "light",
        "dark",
        "purple-light",
        "purple-dark",
        "pink-light",
        "pink-dark",
      ]}
      enableSystem={false}
      {...props}
    >
      {children}
      <ToasterWithTheme />
    </NextThemesProvider>
  );
}
