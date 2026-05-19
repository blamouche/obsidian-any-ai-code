import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  basenameWithoutExt,
  buildPromptPreview,
  computeNextRun,
  describeSchedule,
  isDue,
  parseAutomationFile,
  pushHistory,
  splitFrontmatter,
  type AutomationRunRecord,
  type ParsedAutomation
} from "../automation";

const yamlParser = (text: string): unknown => parseYaml(text) as unknown;

function makeFile(frontmatter: Record<string, unknown>, body: string): string {
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : String(v)}`)
    .join("\n");
  return `---\n${fm}\n---\n${body}`;
}

describe("splitFrontmatter", () => {
  it("splits valid frontmatter from body", () => {
    const r = splitFrontmatter("---\nfoo: 1\n---\nhello");
    expect(r.yaml).toBe("foo: 1");
    expect(r.body).toBe("hello");
  });

  it("returns null yaml when no frontmatter", () => {
    const r = splitFrontmatter("just a body");
    expect(r.yaml).toBeNull();
    expect(r.body).toBe("just a body");
  });

  it("handles CRLF line endings", () => {
    const r = splitFrontmatter("---\r\nfoo: 1\r\n---\r\nhello");
    expect(r.yaml).toBe("foo: 1");
    expect(r.body).toBe("hello");
  });
});

describe("basenameWithoutExt", () => {
  it("strips extension and folders", () => {
    expect(basenameWithoutExt("Automations/daily.md")).toBe("daily");
    expect(basenameWithoutExt("no-folder.md")).toBe("no-folder");
    expect(basenameWithoutExt("noext")).toBe("noext");
  });
});

describe("parseAutomationFile", () => {
  it("parses an interval automation with defaults", () => {
    const file = makeFile({ interval: 60 }, "Summarize my day.");
    const r = parseAutomationFile(file, "Automations/summary.md", yamlParser);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.name).toBe("summary");
    expect(r.entry.enabled).toBe(true);
    expect(r.entry.interval).toBe(60);
    expect(r.entry.cron).toBeNull();
    expect(r.entry.runtime).toBeNull();
    expect(r.entry.appendNewline).toBe(true);
    expect(r.entry.body).toBe("Summarize my day.");
  });

  it("parses a cron automation with explicit name + runtime + disabled", () => {
    const file = makeFile(
      { name: "Daily standup", enabled: false, cron: "0 9 * * 1-5", runtime: "claude", appendNewline: false },
      "Give me the standup brief."
    );
    const r = parseAutomationFile(file, "Automations/standup.md", yamlParser);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.name).toBe("Daily standup");
    expect(r.entry.enabled).toBe(false);
    expect(r.entry.interval).toBeNull();
    expect(r.entry.cron).toBe("0 9 * * 1-5");
    expect(r.entry.runtime).toBe("claude");
    expect(r.entry.appendNewline).toBe(false);
  });

  it("rejects when both interval and cron are set", () => {
    const file = makeFile({ interval: 5, cron: "*/5 * * * *" }, "body");
    const r = parseAutomationFile(file, "x.md", yamlParser);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/mutually exclusive/);
  });

  it("rejects when neither interval nor cron is set", () => {
    const file = makeFile({ name: "no sched" }, "body");
    const r = parseAutomationFile(file, "x.md", yamlParser);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/Missing schedule/);
  });

  it("rejects non-integer interval", () => {
    const file = makeFile({ interval: 1.5 }, "body");
    const r = parseAutomationFile(file, "x.md", yamlParser);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/integer/);
  });

  it("rejects interval < 1", () => {
    const file = makeFile({ interval: 0 }, "body");
    const r = parseAutomationFile(file, "x.md", yamlParser);
    expect(r.ok).toBe(false);
  });

  it("rejects invalid cron", () => {
    const file = makeFile({ cron: "not a cron" }, "body");
    const r = parseAutomationFile(file, "x.md", yamlParser);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/cron/i);
  });

  it("rejects empty body", () => {
    const file = makeFile({ interval: 60 }, "   ");
    const r = parseAutomationFile(file, "x.md", yamlParser);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/empty/);
  });

  it("rejects missing frontmatter", () => {
    const r = parseAutomationFile("no fences here", "x.md", yamlParser);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/Missing frontmatter/);
  });

  it("rejects frontmatter parse errors via the provided yaml parser", () => {
    const r = parseAutomationFile(
      "---\n: : :\n---\nbody",
      "x.md",
      () => {
        throw new Error("boom");
      }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/boom/);
  });
});

function intervalEntry(min: number, enabled = true): ParsedAutomation {
  return {
    path: "a.md",
    name: "a",
    enabled,
    interval: min,
    cron: null,
    runtime: null,
    appendNewline: true,
    body: "x"
  };
}

function cronEntry(expr: string, enabled = true): ParsedAutomation {
  return {
    path: "a.md",
    name: "a",
    enabled,
    interval: null,
    cron: expr,
    runtime: null,
    appendNewline: true,
    body: "x"
  };
}

describe("computeNextRun", () => {
  it("interval: returns now when never run", () => {
    const entry = intervalEntry(30);
    const now = 1_700_000_000_000;
    expect(computeNextRun(entry, null, now)).toBe(now);
  });

  it("interval: adds minutes to lastRun", () => {
    const entry = intervalEntry(15);
    const last = 1_700_000_000_000;
    expect(computeNextRun(entry, last, last + 1_000)).toBe(last + 15 * 60_000);
  });

  it("cron: returns next occurrence after lastRun", () => {
    const entry = cronEntry("*/5 * * * *");
    const last = new Date("2026-05-19T22:00:00Z").getTime();
    const now = last + 60_000;
    const next = computeNextRun(entry, last, now);
    expect(next).toBe(new Date("2026-05-19T22:05:00Z").getTime());
  });

  it("cron: when never run, schedules from just-before-now", () => {
    const entry = cronEntry("*/5 * * * *");
    const now = new Date("2026-05-19T22:03:00Z").getTime();
    const next = computeNextRun(entry, null, now);
    expect(next).toBe(new Date("2026-05-19T22:05:00Z").getTime());
  });
});

describe("isDue", () => {
  it("disabled entries are never due", () => {
    const entry = intervalEntry(1, false);
    expect(isDue(entry, null, Date.now())).toBe(false);
  });

  it("interval entry is due once interval has passed", () => {
    const entry = intervalEntry(5);
    const last = 1_700_000_000_000;
    expect(isDue(entry, last, last + 4 * 60_000)).toBe(false);
    expect(isDue(entry, last, last + 5 * 60_000)).toBe(true);
    expect(isDue(entry, last, last + 6 * 60_000)).toBe(true);
  });

  it("interval entry is due immediately when never run", () => {
    const entry = intervalEntry(60);
    expect(isDue(entry, null, Date.now())).toBe(true);
  });
});

describe("describeSchedule", () => {
  it("formats interval (plural and singular)", () => {
    expect(describeSchedule(intervalEntry(30))).toBe("every 30 min");
    expect(describeSchedule(intervalEntry(1))).toBe("every 1 min");
  });

  it("formats cron", () => {
    expect(describeSchedule(cronEntry("0 9 * * 1-5"))).toBe("cron: 0 9 * * 1-5");
  });
});

describe("pushHistory", () => {
  const makeRec = (ts: number): AutomationRunRecord => ({
    ts,
    path: "a.md",
    name: "a",
    source: "manual",
    status: "ran"
  });

  it("prepends new record", () => {
    const next = pushHistory([makeRec(1)], makeRec(2), 10);
    expect(next.map((r) => r.ts)).toEqual([2, 1]);
  });

  it("truncates to the limit, dropping oldest", () => {
    const history: AutomationRunRecord[] = [3, 2, 1].map((t) => makeRec(t));
    const next = pushHistory(history, makeRec(4), 3);
    expect(next.map((r) => r.ts)).toEqual([4, 3, 2]);
    expect(next.length).toBe(3);
  });

  it("does not mutate the input array", () => {
    const original = [makeRec(1)];
    pushHistory(original, makeRec(2), 10);
    expect(original.map((r) => r.ts)).toEqual([1]);
  });
});

describe("buildPromptPreview", () => {
  it("collapses whitespace and trims", () => {
    expect(buildPromptPreview("  a  b\nc  ")).toBe("a b c");
  });

  it("truncates with ellipsis", () => {
    const long = "a".repeat(200);
    const preview = buildPromptPreview(long, 50);
    expect(preview.length).toBe(50);
    expect(preview.endsWith("…")).toBe(true);
  });
});
