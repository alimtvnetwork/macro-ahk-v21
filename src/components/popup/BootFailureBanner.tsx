import { AlertTriangle } from "lucide-react";

interface BootFailureBannerProps {
  bootStep?: string;
}

/**
 * Renders a prominent error banner when the background service worker
 * boot sequence has failed, showing the exact step that failed.
 */
export function BootFailureBanner({ bootStep }: BootFailureBannerProps) {
  if (!bootStep || !bootStep.startsWith("failed:")) return null;

  const failedStep = bootStep.replace("failed:", "");

  return (
    <div className="mx-4 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-destructive">
          Boot failed at step: <span className="font-mono">{failedStep}</span>
        </p>
        <p className="text-[11px] text-destructive/80 mt-0.5">
          The extension is running in degraded mode. Try reloading the extension
          from <span className="font-mono">chrome://extensions</span>.
        </p>
      </div>
    </div>
  );
}
