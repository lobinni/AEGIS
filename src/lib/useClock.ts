"use client";

import { useEffect, useState } from "react";

/** Ticking clock (1s) for countdowns — mirrors the reference lib/useClock.js. */
export function useClock(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
