/**
 * Lightweight hook that fetches the error/warning count
 * for the sidebar badge. Listens for real-time ERROR_COUNT_CHANGED
 * broadcasts from the background service worker for instant updates,
 * with a polling fallback for environments without chrome.runtime.
 */

import { useEffect, useState, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";

// eslint-disable-next-line max-lines-per-function -- hook with broadcast listener + polling fallback
export function useErrorCount(pollIntervalMs = 30_000) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const result = await sendMessage<{ errors: Array<{ id: string }> }>({ type: "GET_ACTIVE_ERRORS" });
      setCount(result.errors?.length ?? 0);
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    void refresh();

    // Real-time listener for ERROR_COUNT_CHANGED broadcasts
    const runtime = (typeof chrome !== "undefined" ? chrome.runtime : undefined) as
      | { onMessage?: { addListener: (fn: (msg: unknown) => void) => void; removeListener: (fn: (msg: unknown) => void) => void } }
      | undefined;

    const hasChromeRuntime = runtime?.onMessage !== undefined;
    let listenerAttached = false;

    const handleBroadcast = (
      message: unknown,
    ) => {
      const msg = message as { type?: string; count?: number } | null;
      const isErrorCountChange = msg?.type === "ERROR_COUNT_CHANGED";

      if (isErrorCountChange) {
        setCount(msg!.count ?? 0);
      }
    };

    if (hasChromeRuntime) {
      try {
        runtime!.onMessage!.addListener(handleBroadcast);
        listenerAttached = true;
      } catch {
        /* Extension context invalidated — fall back to polling */
      }
    }

    // Polling fallback (slower interval when listener is active)
    const effectiveInterval = listenerAttached ? pollIntervalMs * 2 : pollIntervalMs;
    const id = setInterval(() => void refresh(), effectiveInterval);

    return () => {
      clearInterval(id);
      if (listenerAttached) {
        try {
          runtime!.onMessage!.removeListener(handleBroadcast);
        } catch {
          /* already invalidated */
        }
      }
    };
  }, [refresh, pollIntervalMs]);

  return { count, refresh };
}
