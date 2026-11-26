import type { CliRuntimeConfig } from "./runtime-utils";

/**
 * True when `target` (an automation's declared runtime) refers to `runtime`,
 * matched either by id or by display name (case-insensitive). Mirrors the rule
 * the sidebar view used before sessions existed.
 */
export function runtimeMatches(runtime: CliRuntimeConfig, target: string): boolean {
  const wanted = target.trim().toLowerCase();
  if (!wanted) {
    return false;
  }
  if (runtime.id.trim().toLowerCase() === wanted) {
    return true;
  }
  return runtime.name.trim().toLowerCase() === wanted;
}

/**
 * Resolve which runtime an automation should spawn.
 * - If `declared` is set, find the runtime matching it (id or name); returns
 *   `null` when none matches (the automation is then skipped).
 * - If `declared` is empty/null, fall back to the default runtime
 *   (`defaultId`), then to the first configured runtime.
 */
export function resolveRuntimeForAutomation(
  runtimes: CliRuntimeConfig[],
  declared: string | null | undefined,
  defaultId: string
): CliRuntimeConfig | null {
  const wanted = (declared ?? "").trim();
  if (wanted) {
    return runtimes.find((runtime) => runtimeMatches(runtime, wanted)) ?? null;
  }
  return runtimes.find((runtime) => runtime.id === defaultId) ?? runtimes[0] ?? null;
}

/**
 * Build a tab label for a new session, disambiguating duplicates of the same
 * runtime: "Claude", "Claude (2)", "Claude (3)", ...
 */
export function nextSessionLabel(existingLabels: string[], runtimeName: string): string {
  const base = runtimeName.trim() || "(Unnamed)";
  const taken = new Set(existingLabels);
  if (!taken.has(base)) {
    return base;
  }
  let counter = 2;
  while (taken.has(`${base} (${counter})`)) {
    counter += 1;
  }
  return `${base} (${counter})`;
}

/**
 * Whether another session may be opened given the current count and the
 * configured cap. `max <= 0` means unlimited.
 */
export function canOpenSession(currentCount: number, max: number): boolean {
  if (!Number.isFinite(max) || max <= 0) {
    return true;
  }
  return currentCount < max;
}

/**
 * Wrap a prompt body as a terminal *bracketed paste* so a PTY-attached TUI
 * (Claude Code, Codex, any raw-mode input) buffers the whole payload atomically:
 * embedded newlines stay literal text instead of each acting as an Enter, and a
 * CLI still finishing its boot-time re-renders cannot swallow the leading
 * characters. Line endings are normalized to `\n` first (a stray `\r` mid-body
 * would still read as a submit). The trailing Enter (`\r`) must be written
 * separately, after a short delay, so the paste-detection window closes.
 */
export function encodeBracketedPaste(body: string): string {
  const normalized = body.replace(/\r\n?/g, "\n");
  return `\x1b[200~${normalized}\x1b[201~`;
}

/**
 * CSS modifier class for a session tab's status dot, from its activity:
 * - `is-working`    — a manual session whose CLI is currently producing output (green)
 * - `is-automation` — an automation session whose CLI is currently working (purple)
 * - `is-idle`       — the CLI is quiet/finished, or the process has stopped (gray)
 */
export function tabDotClass(opts: {
  running: boolean;
  activity: "working" | "idle";
  origin: "manual" | "automation";
}): "is-working" | "is-automation" | "is-idle" {
  if (opts.running && opts.activity === "working") {
    return opts.origin === "automation" ? "is-automation" : "is-working";
  }
  return "is-idle";
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

export const MIN_TERMINAL_COLS = 20;
export const MIN_TERMINAL_ROWS = 10;

function isUsableSize(size: TerminalSize | null | undefined): size is TerminalSize {
  return !!size && Number.isFinite(size.cols) && Number.isFinite(size.rows) && size.cols > 0 && size.rows > 0;
}

/**
 * Size a session terminal (and its PTY) should have.
 *
 * While the panel is visible the size fitted to the container wins. While it is
 * hidden (collapsed sidebar, background tab, deferred mount) the container cannot
 * be measured: FitAddon either does nothing (xterm stays 80×24) or collapses to
 * 2 columns. Falling back to the last size measured while visible keeps xterm
 * and the PTY in agreement with what the panel will show once opened, so no
 * resize — and no garbled TUI redraw — happens on reveal. Always clamped to the
 * minimums so the terminal and the PTY get exactly the same numbers.
 */
export function resolveTerminalSize(opts: {
  visible: boolean;
  fitted: TerminalSize | null | undefined;
  lastVisible: TerminalSize | null | undefined;
  current: TerminalSize;
}): TerminalSize {
  const base =
    opts.visible && isUsableSize(opts.fitted)
      ? opts.fitted
      : isUsableSize(opts.lastVisible)
        ? opts.lastVisible
        : opts.current;
  return {
    cols: Math.max(MIN_TERMINAL_COLS, Math.floor(base.cols) || 0),
    rows: Math.max(MIN_TERMINAL_ROWS, Math.floor(base.rows) || 0)
  };
}

/** Parse a stored terminal size, rejecting anything malformed. */
export function parseStoredTerminalSize(raw: unknown): TerminalSize | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const { cols, rows } = raw as Record<string, unknown>;
  const size = { cols: Number(cols), rows: Number(rows) };
  return isUsableSize(size) && size.cols >= MIN_TERMINAL_COLS && size.rows >= MIN_TERMINAL_ROWS ? size : null;
}
