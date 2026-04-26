export interface LaunchSpec {
  file: string;
  args: string[];
}

export interface PathApi {
  join(...parts: string[]): string;
}

export interface CliRuntimeConfig {
  id: string;
  name: string;
  command: string;
}

export interface LegacyRuntimeSettings {
  command?: unknown;
  codexCommand?: unknown;
  runtime?: unknown;
  runtimes?: unknown;
  selectedRuntimeId?: unknown;
}

export function formatActiveFileMention(fileName: string): string {
  return `@${fileName.trim()} `;
}

export function isCodexLikeCommand(command: string | undefined | null): boolean {
  if (typeof command !== "string") {
    return false;
  }
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }
  return trimmed === "codex" || /^codex(\s|$)/.test(trimmed);
}

export function migrateRuntimeSettings(
  raw: LegacyRuntimeSettings | null | undefined,
  defaults: CliRuntimeConfig[],
  generateId: () => string = defaultGenerateRuntimeId
): { runtimes: CliRuntimeConfig[]; selectedRuntimeId: string } {
  const fallbackDefaults = defaults.length > 0
    ? defaults.map((d) => ({ ...d }))
    : [{ id: generateId(), name: "Default", command: "" }];

  if (raw && Array.isArray(raw.runtimes)) {
    const sanitized = sanitizeRuntimes(raw.runtimes, generateId);
    if (sanitized.length > 0) {
      const selected =
        typeof raw.selectedRuntimeId === "string" &&
        sanitized.some((r) => r.id === raw.selectedRuntimeId)
          ? raw.selectedRuntimeId
          : sanitized[0].id;
      return { runtimes: sanitized, selectedRuntimeId: selected };
    }
  }

  const runtimes = fallbackDefaults;
  if (raw && typeof raw.command === "string" && raw.command.trim()) {
    const claude = runtimes.find((r) => r.id === "claude");
    if (claude) {
      claude.command = raw.command.trim();
    }
  }
  if (raw && typeof raw.codexCommand === "string" && raw.codexCommand.trim()) {
    const codex = runtimes.find((r) => r.id === "codex");
    if (codex) {
      codex.command = raw.codexCommand.trim();
    }
  }

  const legacyRuntime =
    typeof raw?.runtime === "string" && (raw.runtime === "claude" || raw.runtime === "codex")
      ? raw.runtime
      : undefined;
  const selectedRuntimeId =
    legacyRuntime && runtimes.some((r) => r.id === legacyRuntime)
      ? legacyRuntime
      : runtimes[0].id;

  return { runtimes, selectedRuntimeId };
}

function sanitizeRuntimes(
  raw: unknown[],
  generateId: () => string
): CliRuntimeConfig[] {
  const result: CliRuntimeConfig[] = [];
  const seenIds = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Partial<CliRuntimeConfig>;
    const name = typeof candidate.name === "string" ? candidate.name : "";
    const command = typeof candidate.command === "string" ? candidate.command : "";
    let id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : generateId();
    while (seenIds.has(id)) {
      id = generateId();
    }
    seenIds.add(id);
    result.push({ id, name, command });
  }
  return result;
}

export function defaultGenerateRuntimeId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `runtime-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolvePluginDir(
  pluginDir: string | undefined,
  vaultBasePath: string | undefined,
  pathApi: { isAbsolute(p: string): boolean; resolve(...parts: string[]): string }
): string | undefined {
  if (!pluginDir) {
    return undefined;
  }
  if (pathApi.isAbsolute(pluginDir)) {
    return pluginDir;
  }
  if (!vaultBasePath) {
    return undefined;
  }
  return pathApi.resolve(vaultBasePath, pluginDir);
}

export function mergePathEntries(
  currentPath: string | undefined,
  extras: string[],
  platform: NodeJS.Platform
): string {
  const delimiter = platform === "win32" ? ";" : ":";
  const existing = (currentPath || "").split(delimiter).filter(Boolean);
  const set = new Set(existing);

  for (const entry of extras) {
    if (!entry || set.has(entry)) {
      continue;
    }
    set.add(entry);
    existing.push(entry);
  }

  return existing.join(delimiter);
}

export function getLaunchSpecs(
  command: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  existsSync: (path: string) => boolean
): LaunchSpec[] {
  if (platform === "win32") {
    const comspec = env.ComSpec || env.COMSPEC || "C:\\Windows\\System32\\cmd.exe";
    return [{ file: comspec, args: ["/d", "/s", "/c", command] }];
  }

  const candidates = [env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"].filter(
    (value): value is string => Boolean(value)
  );

  const launches: LaunchSpec[] = [];
  for (const shell of Array.from(new Set(candidates))) {
    if (!existsSync(shell)) {
      continue;
    }

    if (shell.endsWith("/sh")) {
      launches.push({ file: shell, args: ["-c", command] });
    } else {
      launches.push({ file: shell, args: ["-lc", command] });
    }
  }

  if (launches.length === 0) {
    launches.push({ file: "/bin/sh", args: ["-c", command] });
  }

  return launches;
}

export function resolveExecutableInPath(
  executable: string,
  pathValue: string | undefined,
  platform: NodeJS.Platform,
  existsSync: (path: string) => boolean,
  pathApi: PathApi
): string | undefined {
  if (!pathValue) {
    return undefined;
  }
  const delimiter = platform === "win32" ? ";" : ":";
  const candidates = pathValue.split(delimiter).filter(Boolean);
  const fileName = platform === "win32" ? `${executable}.exe` : executable;

  for (const dir of candidates) {
    const fullPath = pathApi.join(dir, fileName);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  return undefined;
}

export function detectNodeExecutable(
  configuredValue: string | undefined,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  existsSync: (path: string) => boolean,
  pathApi: PathApi
): string {
  const configured = configuredValue?.trim();
  if (configured && configured.toLowerCase() !== "auto") {
    return configured;
  }

  const fromPath = resolveExecutableInPath("node", env.PATH, platform, existsSync, pathApi);
  if (fromPath) {
    return fromPath;
  }

  const home = env.HOME || env.USERPROFILE || "";
  const defaults =
    platform === "win32"
      ? [
          "C:\\Program Files\\nodejs\\node.exe",
          "C:\\Program Files (x86)\\nodejs\\node.exe"
        ]
      : [
          "/opt/homebrew/bin/node",
          "/usr/local/bin/node",
          "/usr/bin/node",
          home ? pathApi.join(home, ".volta", "bin", "node") : "",
          home ? pathApi.join(home, ".nvm", "current", "bin", "node") : ""
        ];

  for (const candidate of defaults) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return "node";
}
