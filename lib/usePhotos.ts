"use client";

import { useEffect, useRef, useState } from "react";
import type { Photo } from "./client";

type Status = "connecting" | "live" | "offline";

const POLL_MS = 3000;

/**
 * Polls the backend every 3 seconds and keeps a live, newest-first photo list.
 * Uses an incremental `since` cursor so each poll only transfers new photos, and
 * detects a server-side wipe (latestSeq drops below our cursor) to resync.
 */
export function usePhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const [queueDepth, setQueueDepth] = useState(0);
  const cursor = useRef(0); // highest seq we've seen

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/photos?since=${cursor.current}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("bad status");
        const data = (await res.json()) as {
          photos: Photo[];
          latestSeq: number;
          queue: number;
        };
        if (!alive) return;

        // Server was cleared/reset → start over.
        if (data.latestSeq < cursor.current) {
          cursor.current = 0;
          setPhotos([]);
        }

        if (data.photos.length > 0) {
          cursor.current = Math.max(
            cursor.current,
            ...data.photos.map((p) => p.seq)
          );
          setPhotos((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const fresh = data.photos
              .filter((p) => !seen.has(p.id))
              .reverse(); // newest first
            return fresh.length ? [...fresh, ...prev] : prev;
          });
        }

        setQueueDepth(data.queue ?? 0);
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
  }, []);

  return { photos, status, queueDepth };
}
