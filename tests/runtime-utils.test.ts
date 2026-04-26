import { describe, expect, it } from "vitest";
import {
  detectNodeExecutable,
  formatActiveFileMention,
  getLaunchSpecs,
  isCodexLikeCommand,
  mergePathEntries,
  migrateRuntimeSettings,
  resolveExecutableInPath,
  resolvePluginDir,
  type CliRuntimeConfig
} from "../runtime-utils";

describe("resolvePluginDir", () => {
  it("returns absolute path unchanged", () => {
    const pathApi = {
      isAbsolute: (p: string) => p.startsWith("/"),
      resolve: (...parts: string[]) => parts.join("/")
    };

    expect(resolvePluginDir("/abs/plugin", "/vault", pathApi)).toBe("/abs/plugin");
  });

  it("resolves relative plugin dir from vault", () => {
    const pathApi = {
      isAbsolute: (p: string) => p.startsWith("/"),
      resolve: (...parts: string[]) => parts.join("/")
    };

    expect(resolvePluginDir(".obsidian/plugins/x", "/vault", pathApi)).toBe(
      "/vault/.obsidian/plugins/x"
    );
  });
});

describe("mergePathEntries", () => {
  it("adds unique paths on unix", () => {
    const merged = mergePathEntries("/usr/bin:/bin", ["/bin", "/custom/bin"], "darwin");
    expect(merged).toBe("/usr/bin:/bin:/custom/bin");
  });

  it("uses windows delimiter", () => {
    const merged = mergePathEntries("C:\\A;C:\\B", ["C:\\B", "C:\\C"], "win32");
    expect(merged).toBe("C:\\A;C:\\B;C:\\C");
  });
});

describe("getLaunchSpecs", () => {
  it("returns cmd launch on windows", () => {
    const specs = getLaunchSpecs(
      "claude",
      "win32",
      { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
      () => true
    );

    expect(specs).toEqual([
      {
        file: "C:\\Windows\\System32\\cmd.exe",
        args: ["/d", "/s", "/c", "claude"]
      }
    ]);
  });

  it("filters unavailable shells and keeps fallback", () => {
    const specs = getLaunchSpecs(
      "claude",
      "linux",
      { SHELL: "/bin/zsh" },
      (shellPath) => shellPath === "/bin/bash"
    );

    expect(specs).toEqual([
      {
        file: "/bin/bash",
        args: ["-lc", "claude"]
      }
    ]);
  });

  it("falls back to /bin/sh when none exists", () => {
    const specs = getLaunchSpecs("claude", "darwin", {}, () => false);
    expect(specs).toEqual([{ file: "/bin/sh", args: ["-c", "claude"] }]);
  });
});

describe("resolveExecutableInPath", () => {
  it("finds node in unix PATH", () => {
    const result = resolveExecutableInPath(
      "node",
      "/usr/bin:/opt/homebrew/bin",
      "darwin",
      (p) => p === "/opt/homebrew/bin/node",
      { join: (...parts) => parts.join("/") }
    );

    expect(result).toBe("/opt/homebrew/bin/node");
  });
});

describe("detectNodeExecutable", () => {
  it("uses explicit configured value", () => {
    const result = detectNodeExecutable(
      "/custom/node",
      "darwin",
      { PATH: "/usr/bin" },
      () => false,
      { join: (...parts) => parts.join("/") }
    );
    expect(result).toBe("/custom/node");
  });

  it("auto-detects from PATH", () => {
    const result = detectNodeExecutable(
      "auto",
      "darwin",
      { PATH: "/usr/bin:/opt/homebrew/bin" },
      (p) => p === "/opt/homebrew/bin/node",
      { join: (...parts) => parts.join("/") }
    );
    expect(result).toBe("/opt/homebrew/bin/node");
  });
});

describe("formatActiveFileMention", () => {
  it("formats mention with leading @ and trailing space", () => {
    expect(formatActiveFileMention("Dossier/monfichier.md")).toBe("@Dossier/monfichier.md ");
  });

  it("trims surrounding spaces from file name", () => {
    expect(formatActiveFileMention("  monfichier.md  ")).toBe("@monfichier.md ");
  });
});

describe("isCodexLikeCommand", () => {
  it("matches bare codex", () => {
    expect(isCodexLikeCommand("codex")).toBe(true);
  });

  it("matches codex with arguments", () => {
    expect(isCodexLikeCommand("codex --no-alt-screen")).toBe(true);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(isCodexLikeCommand("  codex  ")).toBe(true);
  });

  it("does not match commands that merely contain codex", () => {
    expect(isCodexLikeCommand("my-codex-wrapper")).toBe(false);
    expect(isCodexLikeCommand("/usr/local/bin/codex")).toBe(false);
  });

  it("returns false for non-codex commands and empty values", () => {
    expect(isCodexLikeCommand("claude")).toBe(false);
    expect(isCodexLikeCommand("")).toBe(false);
    expect(isCodexLikeCommand(undefined)).toBe(false);
    expect(isCodexLikeCommand(null)).toBe(false);
  });
});

describe("migrateRuntimeSettings", () => {
  const defaults: CliRuntimeConfig[] = [
    { id: "claude", name: "Claude", command: "claude" },
    { id: "codex", name: "Codex", command: "codex --no-alt-screen" }
  ];
  const stableId = () => "generated-id";

  it("returns defaults when no data is stored", () => {
    const result = migrateRuntimeSettings(null, defaults, stableId);
    expect(result.runtimes).toEqual(defaults);
    expect(result.selectedRuntimeId).toBe("claude");
  });

  it("migrates legacy claude/codex command fields and preserves selected runtime", () => {
    const result = migrateRuntimeSettings(
      {
        command: "  claude --print  ",
        codexCommand: "codex --foo",
        runtime: "codex"
      },
      defaults,
      stableId
    );
    expect(result.runtimes).toEqual([
      { id: "claude", name: "Claude", command: "claude --print" },
      { id: "codex", name: "Codex", command: "codex --foo" }
    ]);
    expect(result.selectedRuntimeId).toBe("codex");
  });

  it("ignores invalid legacy runtime values and falls back to first runtime", () => {
    const result = migrateRuntimeSettings(
      { runtime: "openai" },
      defaults,
      stableId
    );
    expect(result.selectedRuntimeId).toBe("claude");
  });

  it("keeps already migrated data intact and clamps invalid selectedRuntimeId", () => {
    const stored = {
      runtimes: [
        { id: "abc", name: "A", command: "a" },
        { id: "def", name: "D", command: "d" }
      ],
      selectedRuntimeId: "ghost"
    };
    const result = migrateRuntimeSettings(stored, defaults, stableId);
    expect(result.runtimes).toEqual(stored.runtimes);
    expect(result.selectedRuntimeId).toBe("abc");
  });

  it("regenerates missing or duplicated ids when sanitizing migrated data", () => {
    let counter = 0;
    const generateId = () => `gen-${++counter}`;
    const result = migrateRuntimeSettings(
      {
        runtimes: [
          { id: "shared", name: "First", command: "first" },
          { id: "shared", name: "Second", command: "second" },
          { name: "Third", command: "third" }
        ],
        selectedRuntimeId: "shared"
      },
      defaults,
      generateId
    );
    const ids = result.runtimes.map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
    expect(result.runtimes[0].id).toBe("shared");
    expect(result.selectedRuntimeId).toBe("shared");
  });
});
