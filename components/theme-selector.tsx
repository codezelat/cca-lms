"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sun,
  Moon,
  Palette,
  Terminal,
  Heart,
  Sparkles,
} from "lucide-react";

const themes = [
  {
    name: "light",
    label: "Light Terminal",
    icon: Sun,
    preview: "bg-gray-50 border-green-200",
    accent: "text-green-600",
  },
  {
    name: "dark",
    label: "Dark Terminal",
    icon: Moon,
    preview: "bg-gray-900 border-green-400",
    accent: "text-green-400",
  },
  {
    name: "purple-light",
    label: "Light Purple",
    icon: Sparkles,
    preview: "bg-purple-50 border-purple-200",
    accent: "text-purple-600",
  },
  {
    name: "purple-dark",
    label: "Dark Purple",
    icon: Sparkles,
    preview: "bg-purple-900 border-purple-400",
    accent: "text-purple-400",
  },
  {
    name: "pink-light",
    label: "Light Pink",
    icon: Heart,
    preview: "bg-pink-50 border-pink-200",
    accent: "text-pink-600",
  },
  {
    name: "pink-dark",
    label: "Dark Pink",
    icon: Heart,
    preview: "bg-pink-900 border-pink-400",
    accent: "text-pink-400",
  },
];

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <Palette className="h-4 w-4" />
      </Button>
    );
  }

  const currentTheme = themes.find((t) => t.name === theme) || themes[0];
  const CurrentIcon = currentTheme.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative terminal-glow"
          title="Change theme"
        >
          <CurrentIcon className="h-4 w-4 transition-all" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-sm font-semibold">Choose Theme</div>
        {themes.map((themeOption) => {
          const Icon = themeOption.icon;
          const isSelected = theme === themeOption.name;

          return (
            <DropdownMenuItem
              key={themeOption.name}
              onClick={() => setTheme(themeOption.name)}
              className="flex items-center gap-3 cursor-pointer"
            >
              <div
                className={`w-4 h-4 rounded border-2 ${themeOption.preview} flex items-center justify-center`}
              >
                {isSelected && (
                  <div className="w-2 h-2 rounded-full bg-current opacity-60" />
                )}
              </div>
              <Icon className={`h-4 w-4 ${themeOption.accent}`} />
              <span className="flex-1">{themeOption.label}</span>
              {isSelected && <Terminal className="h-3 w-3 opacity-60" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
