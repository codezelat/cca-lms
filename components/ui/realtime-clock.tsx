"use client";

import { useEffect, useState } from "react";
import { getServerTime } from "@/lib/utils";

const CLOCK_PLACEHOLDER = "\u2014\u2014:\u2014\u2014:\u2014\u2014";

export function RealTimeClock() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(getServerTime());
    };

    updateClock();

    const timer = setInterval(() => {
      updateClock();
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (!currentTime) {
    return (
      <div className="text-terminal-text-muted text-sm font-mono">
        {CLOCK_PLACEHOLDER}{" "}
        <span className="text-terminal-green">(UTC+5:30)</span>
      </div>
    );
  }

  return (
    <div className="text-terminal-text-muted text-sm font-mono">
      {currentTime.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      })}{" "}
      {currentTime.toLocaleTimeString("en-US", {
        hour12: true,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })}{" "}
      <span className="text-terminal-green">(UTC+5:30)</span>
    </div>
  );
}
