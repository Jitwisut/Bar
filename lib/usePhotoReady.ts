"use client";

import { useEffect, useState } from "react";
import type { Photo } from "./client";

// One promise per image URL — resolves once the browser has fully downloaded
// AND decoded it, so painting later is a single instant frame.
const loaded = new Map<string, Promise<void>>();

export function preloadPhoto(id: string): Promise<void> {
  const src = `/api/img/${id}`;
  let p = loaded.get(src);
  if (!p) {
    p = new Promise<void>((resolve) => {
      const img = new Image();
      img.src = src;
      if (typeof img.decode === "function") {
        img.decode().then(resolve, resolve);
      } else {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      }
    });
    loaded.set(src, p);
  }
  return p;
}

/** Warm the cache for every photo in the feed (queued ones included) so that
 *  by the time a photo's display window starts, its image is already decoded. */
export function usePreloadPhotos(photos: Photo[]) {
  useEffect(() => {
    photos.forEach((p) => {
      preloadPhoto(p.id);
    });
  }, [photos]);
}

/** Returns the photo only after its image is fully decoded. While the next
 *  image is still loading, keeps returning the previous photo so the screen
 *  never shows a half-painted image or flashes the idle state mid-queue. */
export function useLoadedPhoto(photo: Photo | null): Photo | null {
  const [shown, setShown] = useState<Photo | null>(null);

  useEffect(() => {
    if (!photo) {
      setShown(null);
      return;
    }
    let alive = true;
    preloadPhoto(photo.id).then(() => {
      if (alive) setShown(photo);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id]);

  return shown;
}
