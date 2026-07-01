"use client";

import { useEffect, useState } from "react";
import type { Photo } from "./client";

type Status = "connecting" | "live" | "offline";
type UsePhotosOptions = {
  displaySec?: number;
  deleteAfterSec?: number;
};

const POLL_MS = 3000;

/**
 * Polls the backend every 3 seconds and keeps a server-authored photo snapshot.
 * The server owns display windows, so clients replace local state instead of
 * replaying or consuming their own queue.
 */
export function usePhotos(options: UsePhotosOptions = {}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const [queueDepth, setQueueDepth] = useState(0);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const displaySec = options.displaySec;
  const deleteAfterSec = options.deleteAfterSec;

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      try {
        const params = new URLSearchParams();
        if (displaySec !== undefined) params.set("displaySec", String(displaySec));
        if (deleteAfterSec !== undefined) {
          params.set("deleteAfterSec", String(deleteAfterSec));
        }
        const qs = params.toString();
        const res = await fetch(`/api/photos${qs ? `?${qs}` : ""}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("bad status");
        const data = (await res.json()) as {
          photos: Photo[];
          latestSeq: number;
          queue: number;
          serverNow?: number;
        };
        if (!alive) return;

        setPhotos(data.photos ?? []);
        setQueueDepth(data.queue ?? 0);
        setServerOffsetMs((data.serverNow ?? Date.now()) - Date.now());
        setStatus("live");
      } catch {
        if (alive) setStatus("offline");
      }
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [displaySec, deleteAfterSec]);

  return { photos, status, queueDepth, serverOffsetMs };
}
