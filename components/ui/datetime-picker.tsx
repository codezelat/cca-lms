"use client";

import * as React from "react";
import { CalendarIcon, Clock, Zap, X } from "lucide-react";
import { format, setHours, setMinutes, addDays, addWeeks } from "date-fns";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateTimePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  className?: string;
}

const quickPresets = [
  {
    label: "Tomorrow",
    getValue: () => setMinutes(setHours(addDays(new Date(), 1), 23), 59),
  },
  {
    label: "In 3 days",
    getValue: () => setMinutes(setHours(addDays(new Date(), 3), 23), 59),
  },
  {
    label: "In 1 week",
    getValue: () => setMinutes(setHours(addWeeks(new Date(), 1), 23), 59),
  },
  {
    label: "In 2 weeks",
    getValue: () => setMinutes(setHours(addWeeks(new Date(), 2), 23), 59),
  },
];

// ── Time picker: HH · MM · AM/PM with keyboard navigation ────────────────────

function TimePicker({
  hour24,
  minute,
  onHourChange,
  onMinuteChange,
}: {
  hour24: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
}) {
  const isAM = hour24 < 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  const hourRef = React.useRef<HTMLInputElement>(null);
  const minuteRef = React.useRef<HTMLInputElement>(null);
  const periodRef = React.useRef<HTMLButtonElement>(null);

  const toH24 = (h12: number, am: boolean) =>
    am ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12;

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(-2);
    if (!raw) return;
    const num = parseInt(raw);
    if (num > 12) return;
    onHourChange(toH24(num, isAM));
    if (raw.length === 2 || num > 1) minuteRef.current?.focus();
  };

  const handleHourKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onHourChange(toH24((hour12 % 12) + 1, isAM));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onHourChange(toH24(hour12 === 1 ? 12 : hour12 - 1, isAM));
    } else if (e.key === ":" || e.key === "ArrowRight") {
      minuteRef.current?.focus();
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(-2);
    if (!raw) return;
    const num = parseInt(raw);
    if (num > 59) return;
    onMinuteChange(num);
    if (raw.length === 2) periodRef.current?.focus();
  };

  const handleMinuteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onMinuteChange(minute === 59 ? 0 : minute + 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onMinuteChange(minute === 0 ? 59 : minute - 1);
    } else if (e.key === "ArrowRight") {
      periodRef.current?.focus();
    }
  };

  const togglePeriod = () => onHourChange(isAM ? hour24 + 12 : hour24 - 12);

  const handlePeriodKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "a" || e.key === "A") {
      if (!isAM) togglePeriod();
    }
    if (e.key === "p" || e.key === "P") {
      if (isAM) togglePeriod();
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      togglePeriod();
    }
  };

  const inputCls =
    "w-9 h-9 text-center border-0 bg-transparent p-0 font-mono text-base font-semibold focus:ring-0 focus:shadow-none focus:border-0 text-terminal-text";

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-terminal-green/30 bg-terminal-darker px-3 py-2 w-fit shadow-sm">
      <Clock className="h-3.5 w-3.5 text-terminal-green/70 shrink-0 mr-2" />

      <Input
        ref={hourRef}
        className={inputCls}
        value={String(hour12).padStart(2, "0")}
        onChange={handleHourChange}
        onKeyDown={handleHourKeyDown}
        onFocus={(e) => e.target.select()}
        maxLength={2}
        inputMode="numeric"
        aria-label="Hours"
      />

      <span className="text-terminal-green font-bold text-lg leading-none select-none px-0.5">
        :
      </span>

      <Input
        ref={minuteRef}
        className={inputCls}
        value={String(minute).padStart(2, "0")}
        onChange={handleMinuteChange}
        onKeyDown={handleMinuteKeyDown}
        onFocus={(e) => e.target.select()}
        maxLength={2}
        inputMode="numeric"
        aria-label="Minutes"
      />

      <button
        ref={periodRef}
        onClick={togglePeriod}
        onKeyDown={handlePeriodKeyDown}
        className="ml-2 text-[11px] font-mono font-bold px-2 py-1 rounded-md transition-all select-none bg-terminal-green/15 text-terminal-green hover:bg-terminal-green hover:text-terminal-dark border border-terminal-green/20"
        aria-label="Toggle AM/PM"
      >
        {isAM ? "AM" : "PM"}
      </button>
    </div>
  );
}

// ── Main DateTimePicker ───────────────────────────────────────────────────────

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  disabled = false,
  minDate,
  className,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
    value,
  );

  React.useEffect(() => {
    setSelectedDate(value);
  }, [value]);

  const currentHour = selectedDate?.getHours() ?? 23;
  const currentMinute = selectedDate?.getMinutes() ?? 59;

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      setSelectedDate(undefined);
      return;
    }
    setSelectedDate(setMinutes(setHours(date, currentHour), currentMinute));
  };

  const handleHourChange = (h: number) => {
    const base =
      selectedDate ?? setMinutes(setHours(addDays(new Date(), 1), 23), 59);
    setSelectedDate(setMinutes(setHours(base, h), base.getMinutes()));
  };

  const handleMinuteChange = (m: number) => {
    const base =
      selectedDate ?? setMinutes(setHours(addDays(new Date(), 1), 23), 59);
    setSelectedDate(setMinutes(setHours(base, base.getHours()), m));
  };

  const handleConfirm = () => {
    onChange(selectedDate);
    setIsOpen(false);
  };

  const handlePreset = (presetFn: () => Date) => {
    const date = presetFn();
    setSelectedDate(date);
    onChange(date);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedDate(undefined);
    onChange(undefined);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-mono h-10",
            !value && "text-terminal-text-muted",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-terminal-green" />
          {value ? (
            <span className="text-terminal-text">
              {format(value, "PPP 'at' h:mm a")}
            </span>
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-0 overflow-hidden"
        align="start"
        side="bottom"
        sideOffset={6}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-terminal-green/15 bg-terminal-green/5">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-3.5 w-3.5 text-terminal-green" />
            <span className="text-xs font-semibold font-mono text-terminal-green tracking-wide uppercase">
              Due Date & Time
            </span>
          </div>
          {selectedDate && (
            <button
              onClick={handleClear}
              className="text-terminal-text-muted hover:text-destructive transition-colors"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row">
          {/* ── Left: Quick Presets ── */}
          <div className="border-b sm:border-b-0 sm:border-r border-terminal-green/15 p-3 space-y-0.5 sm:w-36 shrink-0">
            <div className="flex items-center gap-1.5 mb-2.5 px-1">
              <Zap className="h-3 w-3 text-terminal-green/70" />
              <span className="text-[10px] font-semibold font-mono text-terminal-text-muted uppercase tracking-widest">
                Quick
              </span>
            </div>
            {quickPresets.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="w-full justify-start font-mono text-xs h-8 hover:bg-terminal-green/10 hover:text-terminal-green px-2"
                onClick={() => handlePreset(preset.getValue)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* ── Right: Calendar + Time ── */}
          <div className="flex flex-col">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              disabled={(date) => (minDate ? date < minDate : false)}
            />

            {/* Time + preview section */}
            <div className="border-t border-terminal-green/15 px-3 pt-3 pb-3 space-y-3">
              {/* Time label + picker on same row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-mono font-semibold text-terminal-text-muted uppercase tracking-widest shrink-0">
                  Time
                </span>
                <TimePicker
                  hour24={currentHour}
                  minute={currentMinute}
                  onHourChange={handleHourChange}
                  onMinuteChange={handleMinuteChange}
                />
              </div>

              {/* Selected preview */}
              {selectedDate && (
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-terminal-green/8 border border-terminal-green/20">
                  <div className="h-1.5 w-1.5 rounded-full bg-terminal-green shrink-0" />
                  <p className="text-xs font-mono text-terminal-green font-medium">
                    {format(selectedDate, "EEE, MMM d yyyy")}
                    <span className="text-terminal-green/60 mx-1">·</span>
                    {format(selectedDate, "h:mm a")}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="border-t border-terminal-green/15 px-3 py-2.5 flex items-center justify-between gap-2">
              <p className="text-[10px] font-mono text-terminal-text-muted">
                {selectedDate
                  ? "↑↓ arrows to adjust time"
                  : "Pick a date first"}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setSelectedDate(value);
                    setIsOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs bg-terminal-green text-terminal-dark hover:bg-terminal-green/90 font-semibold"
                  onClick={handleConfirm}
                  disabled={!selectedDate}
                >
                  Confirm
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
