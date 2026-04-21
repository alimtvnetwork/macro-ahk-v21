import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Check, MousePointerClick, Code2, ListChecks } from "lucide-react";
import { readClickTrail, type ClickTrailEntry } from "@/lib/click-trail";

interface BootFailureBannerProps {
  bootStep?: string;
  /** Underlying error message captured by the background service worker. */
  bootError?: string | null;
  /** Underlying error stack trace captured by the background service worker. */
  bootErrorStack?: string | null;
}

/**
 * Renders a rich diagnostic banner when the background service worker
 * boot sequence has failed. Shows:
 *  - The failed step
 *  - The underlying error message
 *  - Cause-classified, numbered fix steps
 *  - A collapsible stack trace
 *  - A collapsible trail of recent UI actions
 *  - A "copy report" button that bundles everything for support
 */
export function BootFailureBanner({ bootStep, bootError, bootErrorStack }: BootFailureBannerProps) {
  const [showStack, setShowStack] = useState(false);
  const [showTrail, setShowTrail] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!bootStep || !bootStep.startsWith("failed:")) return null;

  const failedStep = bootStep.replace("failed:", "");
  const cause = classifyCause(failedStep, bootError);
  const fixSteps = getFixSteps(cause);
  const trail = readClickTrail();

  const handleCopyReport = async () => {
    const report = buildReport({ failedStep, cause, bootError, bootErrorStack, fixSteps, trail });
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be denied; ignore — the textarea fallback below stays visible.
    }
  };

  return (
    <div className="mx-4 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 space-y-2.5">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-destructive">
            Boot failed at step: <span className="font-mono">{failedStep}</span>
            <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/20 text-destructive uppercase tracking-wide">
              {cause.label}
            </span>
          </p>
          {bootError ? (
            <p className="text-[11px] text-destructive/90 font-mono break-words whitespace-pre-wrap mt-1">
              {bootError}
            </p>
          ) : null}
        </div>
        <button
          onClick={handleCopyReport}
          className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-destructive/40 hover:bg-destructive/20 text-destructive transition-colors"
          title="Copy full diagnostic report to clipboard"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy report"}
        </button>
      </div>

      {/* ── Fix Steps ──────────────────────────────────────── */}
      <div className="rounded border border-destructive/30 bg-destructive/5 p-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ListChecks className="h-3 w-3 text-destructive" />
          <span className="text-[11px] font-semibold text-destructive uppercase tracking-wide">
            Suggested fix
          </span>
        </div>
        <ol className="text-[11px] text-destructive/90 space-y-1 list-decimal list-inside">
          {fixSteps.map((step, idx) => (
            <li key={idx} className="leading-snug">
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* ── Stack Trace (collapsible) ──────────────────────── */}
      {bootErrorStack ? (
        <CollapsibleSection
          icon={<Code2 className="h-3 w-3" />}
          label={`Stack trace (${bootErrorStack.split("\n").length} frames)`}
          isOpen={showStack}
          onToggle={() => setShowStack((v) => !v)}
        >
          <pre className="text-[10px] font-mono text-destructive/80 bg-background/40 rounded p-2 overflow-x-auto max-h-48 whitespace-pre">
            {bootErrorStack}
          </pre>
        </CollapsibleSection>
      ) : null}

      {/* ── Click Trail (collapsible) ──────────────────────── */}
      {trail.length > 0 ? (
        <CollapsibleSection
          icon={<MousePointerClick className="h-3 w-3" />}
          label={`Recent actions (${trail.length})`}
          isOpen={showTrail}
          onToggle={() => setShowTrail((v) => !v)}
        >
          <ul className="text-[10px] font-mono text-destructive/80 bg-background/40 rounded p-2 space-y-0.5 max-h-40 overflow-y-auto">
            {trail.slice().reverse().map((entry, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-destructive/50 shrink-0">{formatTime(entry.at)}</span>
                <span className="text-destructive/60 shrink-0 w-10">{entry.kind}</span>
                <span className="break-all">{entry.label}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Sub-components                                                */
/* ────────────────────────────────────────────────────────────── */

interface CollapsibleSectionProps {
  icon: React.ReactNode;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({ icon, label, isOpen, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div className="rounded border border-destructive/30 bg-destructive/5">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-destructive uppercase tracking-wide hover:bg-destructive/10 transition-colors"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {icon}
        <span>{label}</span>
      </button>
      {isOpen ? <div className="px-2 pb-2">{children}</div> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Cause Classification                                          */
/* ────────────────────────────────────────────────────────────── */

type CauseKind = "wasm-missing" | "wasm" | "opfs" | "storage" | "migration" | "schema" | "unknown";

interface Cause {
  kind: CauseKind;
  label: string;
}

/** Inspects the failed step + error text to classify the root cause. */
function classifyCause(failedStep: string, bootError: string | null | undefined): Cause {
  const errorText = (bootError ?? "");
  const lower = errorText.toLowerCase();

  // Highest priority: the dedicated tag emitted by verifyWasmPresence() when
  // the packaged WASM file is missing or 404. Match the literal tag so
  // semantically similar errors (e.g. an OPFS-side WASM mention) don't
  // accidentally trigger this branch.
  if (errorText.includes("[WASM_FILE_MISSING_404]") || lower.includes("wasm file missing")) {
    return { kind: "wasm-missing", label: "WASM file missing" };
  }
  if (lower.includes("wasm") || lower.includes("sql-wasm")) {
    return { kind: "wasm", label: "WASM load" };
  }
  if (lower.includes("opfs") || lower.includes("getdirectory") || lower.includes("navigator.storage")) {
    return { kind: "opfs", label: "OPFS" };
  }
  if (lower.includes("chrome.storage") || lower.includes("storage quota") || lower.includes("quota_bytes")) {
    return { kind: "storage", label: "chrome.storage" };
  }
  if (lower.includes("migration") || lower.includes("alter table") || lower.includes("create table")) {
    return { kind: "migration", label: "Schema migration" };
  }
  if (failedStep === "db-init" && lower.includes("schema")) {
    return { kind: "schema", label: "Schema" };
  }

  return { kind: "unknown", label: failedStep };
}

/* ────────────────────────────────────────────────────────────── */
/*  Fix Steps                                                     */
/* ────────────────────────────────────────────────────────────── */

/** Returns numbered, cause-specific recovery steps. */
function getFixSteps(cause: Cause): string[] {
  switch (cause.kind) {
    case "wasm-missing":
      return [
        "The packaged extension is missing wasm/sql-wasm.wasm (HEAD request returned 404).",
        "Rebuild with .\\run.ps1 -d — the verifyWasmAsset Vite plugin will self-heal from node_modules/sql.js/dist/, or hard-fail with the exact path if it's missing there too.",
        "Confirm chrome-extension/wasm/sql-wasm.wasm exists after the build, and that manifest.json's web_accessible_resources lists \"wasm/sql-wasm.wasm\".",
        "Open chrome://extensions and click the reload icon on Marco.",
        "Re-open this popup; the banner should disappear and Persistence should switch from \"memory\" to \"opfs\".",
      ];
    case "wasm":
      return [
        "Confirm wasm/sql-wasm.wasm exists in the chrome-extension/ build output.",
        "If missing, rebuild with .\\run.ps1 -d (regenerates the WASM copy via viteStaticCopy).",
        "Open chrome://extensions, click the reload icon on the Marco extension.",
        "Re-open this popup and confirm the banner is gone.",
      ];
    case "opfs":
      return [
        "OPFS is unavailable — the extension is running in degraded memory mode.",
        "Open chrome://settings/cookies → check site data isn't blocked for this extension.",
        "Clear extension storage: chrome://extensions → Marco → Details → \"Clear data\".",
        "Reload the extension from chrome://extensions and re-open this popup.",
      ];
    case "storage":
      return [
        "chrome.storage.local quota exceeded or unavailable.",
        "Open chrome://extensions → Marco → Details → Site settings → clear data.",
        "Reload the extension after clearing.",
        "If it persists, check chrome://settings/storage for browser-wide quota issues.",
      ];
    case "migration":
      return [
        "A schema migration failed — the database may be in an inconsistent state.",
        "Export your data first via Options → Diagnostics → \"Export DB\" (if reachable).",
        "Clear extension storage: chrome://extensions → Marco → Details → \"Clear data\".",
        "Reload the extension; migrations will re-run from a clean schema.",
      ];
    case "schema":
      return [
        "Schema initialization failed before any migration ran.",
        "Reload the extension from chrome://extensions.",
        "If the failure recurs, clear extension storage and reload.",
      ];
    case "unknown":
    default:
      return [
        `Boot failed at the "${cause.label}" step with no recognised cause pattern.`,
        "Use \"Copy report\" above and share the output for triage.",
        "Reload the extension from chrome://extensions to retry.",
      ];
  }
}

/* ────────────────────────────────────────────────────────────── */
/*  Report Builder                                                */
/* ────────────────────────────────────────────────────────────── */

interface ReportInput {
  failedStep: string;
  cause: Cause;
  bootError: string | null | undefined;
  bootErrorStack: string | null | undefined;
  fixSteps: string[];
  trail: ClickTrailEntry[];
}

/** Produces a plain-text bundle suitable for clipboard/issue reports. */
function buildReport(input: ReportInput): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════");
  lines.push("  Marco Boot Failure Report");
  lines.push(`  Generated: ${new Date().toISOString()}`);
  lines.push("═══════════════════════════════════════════");
  lines.push("");
  lines.push(`Failed step:    ${input.failedStep}`);
  lines.push(`Cause:          ${input.cause.label} (${input.cause.kind})`);
  lines.push(`Error message:  ${input.bootError ?? "(none captured)"}`);
  lines.push("");
  lines.push("── Suggested fix ─────────────────────────");
  input.fixSteps.forEach((step, idx) => {
    lines.push(`  ${idx + 1}. ${step}`);
  });
  lines.push("");
  lines.push("── Stack trace ───────────────────────────");
  lines.push(input.bootErrorStack ?? "(unavailable)");
  lines.push("");
  lines.push(`── Recent UI actions (${input.trail.length}) ─────────`);
  if (input.trail.length === 0) {
    lines.push("  (none captured)");
  } else {
    input.trail.forEach((entry) => {
      lines.push(`  ${entry.at}  [${entry.kind}]  ${entry.label}${entry.target ? `  @ ${entry.target}` : ""}`);
    });
  }
  lines.push("");
  return lines.join("\n");
}

/** Formats an ISO timestamp as HH:MM:SS for compact display. */
function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString("en-GB", { hour12: false });
  } catch {
    return iso;
  }
}
