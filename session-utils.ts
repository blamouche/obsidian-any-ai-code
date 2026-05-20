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
