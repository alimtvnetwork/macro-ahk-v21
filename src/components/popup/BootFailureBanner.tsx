import { AlertTriangle } from "lucide-react";

interface BootFailureBannerProps {
  bootStep?: string;
  /** Underlying error message captured by the background service worker. */
  bootError?: string | null;
}

/**
 * Renders a prominent error banner when the background service worker
 * boot sequence has failed, showing the exact step that failed and the
 * underlying error message so the failure is self-diagnosing.
 */
export function BootFailureBanner({ bootStep, bootError }: BootFailureBannerProps) {
  if (!bootStep || !bootStep.startsWith("failed:")) return null;

  const failedStep = bootStep.replace("failed:", "");
  const hint = getRecoveryHint(failedStep, bootError);

  return (
    <div className="mx-4 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold text-destructive">
          Boot failed at step: <span className="font-mono">{failedStep}</span>
        </p>
        {bootError ? (
          <p className="text-[11px] text-destructive/90 font-mono break-words whitespace-pre-wrap">
            {bootError}
          </p>
        ) : null}
        <p className="text-[11px] text-destructive/80">
          {hint}
        </p>
      </div>
    </div>
  );
}

/** Returns a step-specific recovery hint to guide the user. */
function getRecoveryHint(failedStep: string, bootError: string | null | undefined): string {
  const errorText = (bootError ?? "").toLowerCase();

  if (failedStep === "db-init") {
    if (errorText.includes("wasm")) {
      return "SQLite WASM binary failed to load. Rebuild and reload the extension from chrome://extensions.";
    }
    if (errorText.includes("opfs") || errorText.includes("storage")) {
      return "Database persistence layer failed. Try clearing the extension's storage or reloading from chrome://extensions.";
    }
    return "Database initialization failed. Reload the extension from chrome://extensions; if it persists, rebuild the extension.";
  }

  return "The extension is running in degraded mode. Try reloading the extension from chrome://extensions.";
}
