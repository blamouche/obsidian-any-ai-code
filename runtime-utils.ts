export interface LaunchSpec {
  file: string;
  args: string[];
}

export interface PathApi {
  join(...parts: string[]): string;
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
