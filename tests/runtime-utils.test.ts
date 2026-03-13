import { describe, expect, it } from "vitest";
import {
  detectNodeExecutable,
  formatActiveFileMention,
  getLaunchSpecs,
  mergePathEntries,
  resolveExecutableInPath,
  resolvePluginDir
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
