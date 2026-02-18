"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 font-mono", className)}
      classNames={{
        // v9 API — root & layout
        root: "rdp",
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium text-terminal-green",
        // v9 navigation
        nav: "absolute inset-x-0 top-0 flex items-center justify-between px-1 pt-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        // v9 grid
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-terminal-text-muted rounded-md w-9 font-normal text-[0.8rem] text-center",
        weeks: "",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
        ),
        // v9 selection & flags
        selected:
          "bg-terminal-green text-terminal-dark rounded-md hover:bg-terminal-green hover:text-terminal-dark focus:bg-terminal-green focus:text-terminal-dark",
        today: "bg-terminal-green/20 text-terminal-green rounded-md",
        outside:
          "text-terminal-text-muted opacity-50 aria-selected:bg-terminal-green/50 aria-selected:text-terminal-text-muted aria-selected:opacity-30",
        disabled: "text-terminal-text-muted opacity-50",
        range_middle:
          "aria-selected:bg-terminal-green/50 aria-selected:text-terminal-text",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
