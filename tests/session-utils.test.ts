import { describe, expect, it } from "vitest";
import {
  canOpenSession,
  nextSessionLabel,
  resolveRuntimeForAutomation,
  runtimeMatches,
  tabDotClass
} from "../session-utils";
import type { CliRuntimeConfig } from "../runtime-utils";

const runtimes: CliRuntimeConfig[] = [
  { id: "claude", name: "Claude", command: "claude" },
  { id: "codex", name: "Codex", command: "codex" },
  { id: "abc123", name: "My Gemini", command: "gemini" }
];

describe("runtimeMatches", () => {
  it("matches by id", () => {
    expect(runtimeMatches(runtimes[0], "claude")).toBe(true);
  });

  it("matches by name case-insensitively", () => {
    expect(runtimeMatches(runtimes[2], "my gemini")).toBe(true);
  });

  it("returns false on no match or empty target", () => {
    expect(runtimeMatches(runtimes[0], "codex")).toBe(false);
    expect(runtimeMatches(runtimes[0], "  ")).toBe(false);
  });
});

describe("resolveRuntimeForAutomation", () => {
  it("resolves a declared runtime by name", () => {
    expect(resolveRuntimeForAutomation(runtimes, "Codex", "claude")?.id).toBe("codex");
  });

  it("resolves a declared runtime by id", () => {
    expect(resolveRuntimeForAutomation(runtimes, "abc123", "claude")?.id).toBe("abc123");
  });

  it("returns null when a declared runtime is unknown", () => {
    expect(resolveRuntimeForAutomation(runtimes, "Nope", "claude")).toBeNull();
  });

  it("falls back to the default runtime when none is declared", () => {
    expect(resolveRuntimeForAutomation(runtimes, null, "codex")?.id).toBe("codex");
    expect(resolveRuntimeForAutomation(runtimes, "", "abc123")?.id).toBe("abc123");
  });

  it("falls back to the first runtime when the default id is invalid", () => {
    expect(resolveRuntimeForAutomation(runtimes, null, "missing")?.id).toBe("claude");
  });

  it("returns null when there are no runtimes", () => {
    expect(resolveRuntimeForAutomation([], null, "claude")).toBeNull();
  });
});

describe("nextSessionLabel", () => {
  it("uses the runtime name when free", () => {
    expect(nextSessionLabel([], "Claude")).toBe("Claude");
  });

  it("disambiguates duplicates", () => {
    expect(nextSessionLabel(["Claude"], "Claude")).toBe("Claude (2)");
    expect(nextSessionLabel(["Claude", "Claude (2)"], "Claude")).toBe("Claude (3)");
  });

  it("falls back to (Unnamed) for blank names", () => {
    expect(nextSessionLabel([], "  ")).toBe("(Unnamed)");
  });
});

describe("canOpenSession", () => {
  it("allows when under the cap", () => {
    expect(canOpenSession(2, 8)).toBe(true);
  });

  it("blocks at the cap", () => {
    expect(canOpenSession(8, 8)).toBe(false);
  });

  it("treats 0 or negative as unlimited", () => {
    expect(canOpenSession(100, 0)).toBe(true);
    expect(canOpenSession(100, -1)).toBe(true);
  });
});

describe("tabDotClass", () => {
  it("is green for a working manual session", () => {
    expect(tabDotClass({ running: true, activity: "working", origin: "manual" })).toBe("is-working");
  });

  it("is purple for a working automation session", () => {
    expect(tabDotClass({ running: true, activity: "working", origin: "automation" })).toBe(
      "is-automation"
    );
  });

  it("is gray when idle, regardless of origin", () => {
    expect(tabDotClass({ running: true, activity: "idle", origin: "manual" })).toBe("is-idle");
    expect(tabDotClass({ running: true, activity: "idle", origin: "automation" })).toBe("is-idle");
  });

  it("is gray when the process has stopped even if last activity was working", () => {
    expect(tabDotClass({ running: false, activity: "working", origin: "automation" })).toBe(
      "is-idle"
    );
  });
});
