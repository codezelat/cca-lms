"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

type ThemeProviderProps = React.ComponentPropsWithoutRef<
  typeof NextThemesProvider
>;

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
    </NextThemesProvider>
  );
}
