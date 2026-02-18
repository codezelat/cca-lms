"use client";

import * as React from "react";
import { CalendarIcon, Clock } from "lucide-react";
import { format, setHours, setMinutes, addDays, addWeeks } from "date-fns";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
    label: "Tomorrow 11:59 PM",
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

// ── Clock face component ──────────────────────────────────────────────────────

type ClockMode = "hours" | "minutes";

function ClockFace({
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
  const [mode, setMode] = React.useState<ClockMode>("hours");
  const clockRef = React.useRef<HTMLDivElement>(null);

  const isAM = hour24 < 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  const toggleAmPm = () => {
    onHourChange(isAM ? hour24 + 12 : hour24 - 12);
  };

  // Angle helpers
  const hourAngle = ((hour12 / 12) * 360 - 90) * (Math.PI / 180);
  const minuteAngle = ((minute / 60) * 360 - 90) * (Math.PI / 180);

  const RADIUS = 80; // clock face radius px
  const CENTER = 96; // svg center (192/2)

  // Hour numbers on the face (1–12)
  const hourNumbers = Array.from({ length: 12 }, (_, i) => i + 1);
  // Minute marks (every 5 min)
  const minuteNumbers = Array.from({ length: 12 }, (_, i) => i * 5);

  const getPos = (angle: number, r: number) => ({
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  });

  const handleClockClick = (e: React.MouseEvent<SVGElement>) => {
    const rect = clockRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - CENTER;
    const y = e.clientY - rect.top - CENTER;
    const angle = Math.atan2(y, x); // -π to π
    const deg = ((angle * 180) / Math.PI + 90 + 360) % 360; // 0 = top

    if (mode === "hours") {
      const h12 = Math.round(deg / 30) % 12 || 12;
      const h24 = isAM ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12;
      onHourChange(h24);
      // Auto-switch to minutes after picking hour
      setTimeout(() => setMode("minutes"), 150);
    } else {
      const m = Math.round(deg / 6) % 60;
      onMinuteChange(m);
    }
  };

  // Hand endpoint
  const handEnd =
    mode === "hours"
      ? getPos(hourAngle, RADIUS * 0.6)
      : getPos(minuteAngle, RADIUS * 0.75);

  return (
    <div className="flex flex-col items-center gap-3 p-3">
      {/* Digital display + mode toggle */}
      <div className="flex items-center gap-1 font-mono text-2xl font-bold select-none">
        <button
          onClick={() => setMode("hours")}
          className={cn(
            "px-2 py-1 rounded-md transition-colors",
            mode === "hours"
              ? "text-terminal-green bg-terminal-green/15"
              : "text-terminal-text-muted hover:text-terminal-text",
          )}
        >
          {String(hour12).padStart(2, "0")}
        </button>
        <span className="text-terminal-text-muted">:</span>
        <button
          onClick={() => setMode("minutes")}
          className={cn(
            "px-2 py-1 rounded-md transition-colors",
            mode === "minutes"
              ? "text-terminal-green bg-terminal-green/15"
              : "text-terminal-text-muted hover:text-terminal-text",
          )}
        >
          {String(minute).padStart(2, "0")}
        </button>
        {/* AM / PM toggle */}
        <div className="flex flex-col ml-2 gap-1">
          {(["AM", "PM"] as const).map((period) => (
            <button
              key={period}
              onClick={() => {
                const wantAM = period === "AM";
                if (wantAM !== isAM) toggleAmPm();
              }}
              className={cn(
                "text-xs font-mono px-1.5 py-0.5 rounded transition-colors",
                (period === "AM") === isAM
                  ? "bg-terminal-green text-terminal-dark font-semibold"
                  : "text-terminal-text-muted hover:text-terminal-text border border-terminal-border",
              )}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Clock face SVG */}
      <div ref={clockRef} className="relative">
        <svg
          width={192}
          height={192}
          className="cursor-pointer"
          onClick={handleClockClick}
        >
          {/* Outer circle */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            style={{
              fill: "var(--terminal-darker)",
              stroke: "var(--terminal-border)",
            }}
            strokeWidth={1.5}
          />

          {/* Tick marks */}
          {Array.from({ length: 60 }, (_, i) => {
            const a = ((i / 60) * 360 - 90) * (Math.PI / 180);
            const isMajor = i % 5 === 0;
            const inner = getPos(a, RADIUS * (isMajor ? 0.82 : 0.88));
            const outer = getPos(a, RADIUS * 0.94);
            return (
              <line
                key={i}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                style={{
                  stroke: isMajor
                    ? "color-mix(in srgb, var(--terminal-green) 40%, transparent)"
                    : "var(--terminal-border)",
                }}
                strokeWidth={isMajor ? 1.5 : 0.75}
              />
            );
          })}

          {/* Hour / minute numbers */}
          {mode === "hours"
            ? hourNumbers.map((h) => {
                const a = ((h / 12) * 360 - 90) * (Math.PI / 180);
                const pos = getPos(a, RADIUS * 0.7);
                const h24 = isAM ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12;
                const isSelected = h24 === hour24;
                return (
                  <text
                    key={h}
                    x={pos.x}
                    y={pos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={isSelected ? 13 : 11}
                    fontWeight={isSelected ? "700" : "400"}
                    fontFamily="monospace"
                    style={{
                      fill: isSelected
                        ? "var(--terminal-green)"
                        : "var(--terminal-text-muted)",
                    }}
                  >
                    {h}
                  </text>
                );
              })
            : minuteNumbers.map((m) => {
                const a = ((m / 60) * 360 - 90) * (Math.PI / 180);
                const pos = getPos(a, RADIUS * 0.7);
                const isSelected = m === minute;
                return (
                  <text
                    key={m}
                    x={pos.x}
                    y={pos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={isSelected ? 12 : 10}
                    fontWeight={isSelected ? "700" : "400"}
                    fontFamily="monospace"
                    style={{
                      fill: isSelected
                        ? "var(--terminal-green)"
                        : "var(--terminal-text-muted)",
                    }}
                  >
                    {String(m).padStart(2, "0")}
                  </text>
                );
              })}

          {/* Hand */}
          <line
            x1={CENTER}
            y1={CENTER}
            x2={handEnd.x}
            y2={handEnd.y}
            style={{ stroke: "var(--terminal-green)" }}
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* Center dot */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={4}
            style={{ fill: "var(--terminal-green)" }}
          />

          {/* Hand tip dot */}
          <circle
            cx={handEnd.x}
            cy={handEnd.y}
            r={6}
            style={{ fill: "var(--terminal-green)" }}
          />
        </svg>

        {/* Mode hint */}
        <p className="text-center text-[10px] font-mono text-terminal-text-muted mt-1">
          {mode === "hours" ? "Click to set hour" : "Click to set minute"}
        </p>
      </div>
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
            "w-full justify-start text-left font-mono",
            !value && "text-terminal-text-muted",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-terminal-green" />
          {value ? (
            format(value, "PPP 'at' h:mm a")
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-0"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="flex flex-col sm:flex-row">
          {/* ── Left: Quick Presets ── */}
          <div className="border-b sm:border-b-0 sm:border-r border-terminal-green/20 p-3 space-y-1 sm:w-37 shrink-0">
            <div className="text-xs font-semibold text-terminal-green mb-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Quick Set
            </div>
            {quickPresets.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="w-full justify-start font-mono text-xs hover:bg-terminal-green/10 hover:text-terminal-green"
                onClick={() => handlePreset(preset.getValue)}
              >
                {preset.label}
              </Button>
            ))}
            <div className="border-t border-terminal-green/20 pt-2 mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start font-mono text-xs text-terminal-text-muted hover:text-destructive"
                onClick={handleClear}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* ── Right: Calendar + Clock ── */}
          <div className="flex flex-col">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              disabled={(date) => (minDate ? date < minDate : false)}
            />

            {/* Clock face */}
            <div className="border-t border-terminal-green/20">
              <ClockFace
                hour24={currentHour}
                minute={currentMinute}
                onHourChange={handleHourChange}
                onMinuteChange={handleMinuteChange}
              />
            </div>

            {/* Selected preview */}
            {selectedDate && (
              <div className="mx-3 mb-3 p-2 bg-terminal-green/10 rounded-md border border-terminal-green/20">
                <p className="text-xs text-terminal-text-muted">Selected:</p>
                <p className="text-sm font-mono text-terminal-green">
                  {format(selectedDate, "EEE, MMM d, yyyy · h:mm a")}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="border-t border-terminal-green/20 p-3 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedDate(value);
                  setIsOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={!selectedDate}
                className="bg-terminal-green text-terminal-dark hover:bg-terminal-green/90"
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
