"use client";

import { useState } from "react";

type Props = {
  /** Full display window in ms (server-owned: displayUntil − displayStartedAt). */
  durationMs: number;
  /** Ms already elapsed when this photo first appears (handles mid-display refresh). */
  elapsedMs: number;
  className: string;
};

/**
 * Cyan countdown bar that shrinks over exactly the photo's display window.
 *
 * The parent re-renders on a 500ms clock tick; if we fed `elapsedMs` straight
 * into `animationDelay` each render the browser would re-seat the CSS animation
 * every tick and the bar would visibly stutter. Instead we snapshot the delay
 * once at mount — the parent gives this component a fresh `key` per photo, so a
 * new photo remounts with a fresh (usually 0) delay while the current photo's
 * bar animates smoothly and uninterrupted.
 */
export function CountdownBar({ durationMs, elapsedMs, className }: Props) {
  const [delay] = useState(() => Math.min(elapsedMs, durationMs));

  return (
    <div
      className={className}
      style={{
        animationDuration: `${durationMs}ms`,
        animationDelay: `-${delay}ms`,
      }}
    />
  );
}
