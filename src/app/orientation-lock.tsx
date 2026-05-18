"use client";

import { useEffect } from "react";

export function OrientationLock() {
  useEffect(() => {
    async function lockPortrait() {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: "portrait") => Promise<void>;
      };

      if (!orientation?.lock) {
        return;
      }

      try {
        await orientation.lock("portrait");
      } catch {
        // Browsers may reject orientation lock outside installed/fullscreen apps.
      }
    }

    void lockPortrait();
  }, []);

  return null;
}
