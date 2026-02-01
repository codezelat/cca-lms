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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  // Sync internal state with external value
  React.useEffect(() => {
    setSelectedDate(value);
  }, [value]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 15, 30, 45];

  const currentHour = selectedDate?.getHours() ?? 23;
  const currentMinute = selectedDate?.getMinutes() ?? 59;

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      setSelectedDate(undefined);
      return;
    }

    // Preserve time when selecting a new date
    const newDate = setMinutes(setHours(date, currentHour), currentMinute);
    setSelectedDate(newDate);
  };

  const handleTimeChange = (type: "hour" | "minute", value: string) => {
    if (!selectedDate) {
      // If no date selected, use tomorrow
      const tomorrow = addDays(new Date(), 1);
      const newDate =
        type === "hour"
          ? setMinutes(setHours(tomorrow, parseInt(value)), currentMinute)
          : setMinutes(setHours(tomorrow, currentHour), parseInt(value));
      setSelectedDate(newDate);
    } else {
      const newDate =
        type === "hour"
          ? setHours(selectedDate, parseInt(value))
          : setMinutes(selectedDate, parseInt(value));
      setSelectedDate(newDate);
    }
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
          <CalendarIcon className="mr-2 h-4 w-4 text-terminal-green" />
          {value ? (
            format(value, "PPP 'at' h:mm a")
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          {/* Quick Presets */}
          <div className="border-b sm:border-b-0 sm:border-r border-terminal-green/20 p-3 space-y-1">
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

          {/* Calendar + Time */}
          <div className="flex flex-col">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              disabled={(date) => (minDate ? date < minDate : false)}
              initialFocus
            />

            {/* Time Picker */}
            <div className="border-t border-terminal-green/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-terminal-green" />
                  <span className="text-sm font-medium">Time</span>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={currentHour.toString()}
                    onValueChange={(v) => handleTimeChange("hour", v)}
                  >
                    <SelectTrigger className="w-[70px] h-8 font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {hours.map((hour) => (
                        <SelectItem
                          key={hour}
                          value={hour.toString()}
                          className="font-mono"
                        >
                          {hour.toString().padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-terminal-green font-bold">:</span>
                  <Select
                    value={currentMinute.toString()}
                    onValueChange={(v) => handleTimeChange("minute", v)}
                  >
                    <SelectTrigger className="w-[70px] h-8 font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {minutes.map((minute) => (
                        <SelectItem
                          key={minute}
                          value={minute.toString()}
                          className="font-mono"
                        >
                          {minute.toString().padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Selected Preview */}
              {selectedDate && (
                <div className="mt-3 p-2 bg-terminal-green/10 rounded-md border border-terminal-green/20">
                  <p className="text-xs text-terminal-text-muted">Selected:</p>
                  <p className="text-sm font-mono text-terminal-green">
                    {format(selectedDate, "EEEE, MMMM d, yyyy")}
                  </p>
                  <p className="text-sm font-mono text-terminal-green">
                    {format(selectedDate, "h:mm a")}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="border-t border-terminal-green/20 p-3 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
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
