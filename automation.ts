import { CronExpressionParser } from "cron-parser";

export interface AutomationFrontmatter {
  name?: string;
  enabled?: boolean;
  interval?: number;
  cron?: string;
  runtime?: string;
  appendNewline?: boolean;
}

export interface ParsedAutomation {
  path: string;
  name: string;
  enabled: boolean;
  interval: number | null;
  cron: string | null;
  runtime: string | null;
  appendNewline: boolean;
  body: string;
}

export interface AutomationParseError {
  path: string;
  name: string;
  reason: string;
}

export type ParseResult =
  | { ok: true; entry: ParsedAutomation }
  | { ok: false; error: AutomationParseError };

export interface AutomationRunRecord {
  ts: number;
  path: string;
  name: string;
  source: "scheduler" | "manual";
  status: "ran" | "skipped" | "error";
  reason?: string;
  runtimeId?: string | null;
  promptPreview?: string;
}

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?([\s\S]*)$/;

export interface FrontmatterParser {
  (yaml: string): unknown;
}

export function splitFrontmatter(content: string): { yaml: string | null; body: string } {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    return { yaml: null, body: content };
  }
  return { yaml: match[1], body: match[2] ?? "" };
}

export function basenameWithoutExt(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  const file = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}

export function parseAutomationFile(
  content: string,
  filePath: string,
  parseYaml: FrontmatterParser
): ParseResult {
  const fallbackName = basenameWithoutExt(filePath);
  const { yaml, body } = splitFrontmatter(content);

  if (yaml === null) {
    return {
      ok: false,
      error: {
        path: filePath,
        name: fallbackName,
        reason: "Missing frontmatter block (expected `---` fenced YAML at top of file)."
      }
    };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(yaml);
  } catch (err) {
    return {
      ok: false,
      error: {
        path: filePath,
        name: fallbackName,
        reason: `YAML parse error: ${(err as Error).message}`
      }
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      error: {
        path: filePath,
        name: fallbackName,
        reason: "Frontmatter must be a YAML mapping."
      }
    };
  }

  const fm = parsed as AutomationFrontmatter;
  const hasInterval = fm.interval !== undefined && fm.interval !== null;
  const hasCron = typeof fm.cron === "string" && fm.cron.trim().length > 0;

  if (hasInterval && hasCron) {
    return {
      ok: false,
      error: {
        path: filePath,
        name: typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : fallbackName,
        reason: "`interval` and `cron` are mutually exclusive — set only one."
      }
    };
  }

  if (!hasInterval && !hasCron) {
    return {
      ok: false,
      error: {
        path: filePath,
        name: typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : fallbackName,
        reason: "Missing schedule: set either `interval` (minutes) or `cron`."
      }
    };
  }

  let interval: number | null = null;
  if (hasInterval) {
    const raw = fm.interval;
    if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1) {
      return {
        ok: false,
        error: {
          path: filePath,
          name: typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : fallbackName,
          reason: "`interval` must be an integer >= 1 (minutes)."
        }
      };
    }
    interval = raw;
  }

  let cron: string | null = null;
  if (hasCron) {
    const expr = (fm.cron as string).trim();
    try {
      CronExpressionParser.parse(expr);
    } catch (err) {
      return {
        ok: false,
        error: {
          path: filePath,
          name: typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : fallbackName,
          reason: `Invalid cron expression: ${(err as Error).message}`
        }
      };
    }
    cron = expr;
  }

  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return {
      ok: false,
      error: {
        path: filePath,
        name: typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : fallbackName,
        reason: "Prompt body is empty (write the prompt below the frontmatter)."
      }
    };
  }

  return {
    ok: true,
    entry: {
      path: filePath,
      name: typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : fallbackName,
      enabled: typeof fm.enabled === "boolean" ? fm.enabled : true,
      interval,
      cron,
      runtime: typeof fm.runtime === "string" && fm.runtime.trim() ? fm.runtime.trim() : null,
      appendNewline: typeof fm.appendNewline === "boolean" ? fm.appendNewline : true,
      body: trimmedBody
    }
  };
}

/**
 * Returns the epoch ms of the next scheduled run, or null if the entry has no
 * usable schedule. Cron schedules are advanced from `lastRun` (or `now` if never
 * run); interval schedules add `interval * 60_000` to `lastRun`, or fire immediately
 * when never run.
 */
export function computeNextRun(
  entry: ParsedAutomation,
  lastRun: number | null,
  now: number
): number | null {
  if (entry.interval !== null) {
    if (lastRun === null) {
      return now;
    }
    return lastRun + entry.interval * 60_000;
  }
  if (entry.cron !== null) {
    try {
      const reference = lastRun ?? now - 1;
      const it = CronExpressionParser.parse(entry.cron, {
        currentDate: new Date(reference)
      });
      return it.next().getTime();
    } catch {
      return null;
    }
  }
  return null;
}

export function isDue(
  entry: ParsedAutomation,
  lastRun: number | null,
  now: number
): boolean {
  if (!entry.enabled) {
    return false;
  }
  const next = computeNextRun(entry, lastRun, now);
  return next !== null && next <= now;
}

export function describeSchedule(entry: ParsedAutomation): string {
  if (entry.interval !== null) {
    return entry.interval === 1 ? "every 1 min" : `every ${entry.interval} min`;
  }
  if (entry.cron !== null) {
    return `cron: ${entry.cron}`;
  }
  return "no schedule";
}

export function pushHistory(
  history: AutomationRunRecord[],
  record: AutomationRunRecord,
  limit: number
): AutomationRunRecord[] {
  const next = [record, ...history];
  if (next.length > limit) {
    next.length = limit;
  }
  return next;
}

export function buildPromptPreview(body: string, maxLen = 120): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) {
    return oneLine;
  }
  return `${oneLine.slice(0, maxLen - 1)}…`;
}
