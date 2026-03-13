const pty = require("node-pty");
const { spawn } = require("child_process");
const fs = require("fs");

function decodePayload(raw) {
  if (!raw) {
    throw new Error("Missing proxy payload");
  }
  const json = Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json);
}

function getLaunchSpecs(command) {
  if (process.platform === "win32") {
    const comspec = process.env.ComSpec || process.env.COMSPEC || "C:\\Windows\\System32\\cmd.exe";
    return [{ file: comspec, args: ["/d", "/s", "/c", command] }];
  }

  const candidates = [process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"].filter(Boolean);
  const unique = Array.from(new Set(candidates));

  const launches = [];
  for (const shell of unique) {
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

function spawnWithFallback(launches, options) {
  const failures = [];
  for (const launch of launches) {
    try {
      return pty.spawn(launch.file, launch.args, options);
    } catch (error) {
      failures.push(`${launch.file}: ${error.message}`);
    }
  }
  throw new Error(`All launch attempts failed. ${failures.join(" | ")}`);
}

function spawnPipeWithFallback(launches, options) {
  const failures = [];
  for (const launch of launches) {
    try {
      const child = spawn(launch.file, launch.args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ["pipe", "pipe", "pipe"]
      });
      return child;
    } catch (error) {
      failures.push(`${launch.file}: ${error.message}`);
    }
  }
  throw new Error(`All pipe launch attempts failed. ${failures.join(" | ")}`);
}

function buildScriptLaunches(command, launches) {
  if (process.platform === "win32") {
    return [];
  }
  if (!fs.existsSync("/usr/bin/script") && !fs.existsSync("/bin/script")) {
    return [];
  }

  const scriptBin = fs.existsSync("/usr/bin/script") ? "/usr/bin/script" : "/bin/script";
  const wrappers = [];

  // macOS/BSD script syntax
  for (const launch of launches) {
    wrappers.push({
      file: scriptBin,
      args: ["-q", "/dev/null", launch.file, ...launch.args]
    });
  }

  // GNU script syntax fallback
  wrappers.push({
    file: scriptBin,
    args: ["-q", "-c", command, "/dev/null"]
  });

  return wrappers;
}

function isCodexCommand(command) {
  if (!command || typeof command !== "string") {
    return false;
  }
  const trimmed = command.trim();
  return trimmed === "codex" || trimmed.startsWith("codex ");
}

function resolvePythonExecutable() {
  const candidates = [
    process.env.PYTHON,
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
    "python3",
    "python"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("/")) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    return candidate;
  }

  return "python3";
}

function spawnPythonBridge(payload, launches) {
  if (process.platform === "win32") {
    throw new Error("python PTY bridge is not available on Windows");
  }

  const path = require("path");
  const bridgePath = path.join(__dirname, "pty-bridge.py");
  if (!fs.existsSync(bridgePath)) {
    throw new Error(`missing python bridge script: ${bridgePath}`);
  }

  const pythonExec = resolvePythonExecutable();
  const encoded = Buffer.from(
    JSON.stringify({
      cwd: payload.cwd,
      env: payload.env,
      launches
    }),
    "utf8"
  ).toString("base64");

  return spawn(pythonExec, [bridgePath, encoded], {
    cwd: payload.cwd,
    env: payload.env,
    stdio: ["pipe", "pipe", "pipe"]
  });
}

async function main() {
  const payload = decodePayload(process.argv[2]);
  const launches = getLaunchSpecs(payload.command);

  let term;
  let mode = "pty";
  try {
    term = spawnWithFallback(launches, {
      name: "xterm-256color",
      cols: Math.max(20, Number(payload.cols) || 120),
      rows: Math.max(10, Number(payload.rows) || 30),
      cwd: payload.cwd,
      env: {
        ...payload.env,
        TERM: "xterm-256color"
      },
      useConpty: process.platform === "win32"
    });
  } catch (error) {
    process.stderr.write(`[proxy-warn] PTY unavailable, switching to pipe mode: ${error.message}\n`);
    mode = "pipe";
    try {
      const fallbackEnv = {
        ...payload.env,
        TERM: "xterm-256color"
      };
      const scriptLaunches = buildScriptLaunches(payload.command, launches);
      const preferScript = isCodexCommand(payload.command) && scriptLaunches.length > 0;

      if (preferScript) {
        process.stderr.write("[proxy-info] codex detected, trying system 'script' fallback first\n");
        try {
          term = spawnPipeWithFallback(scriptLaunches, {
            cwd: payload.cwd,
            env: fallbackEnv
          });
          process.stderr.write("[proxy-info] script fallback started\n");
        } catch (scriptError) {
          process.stderr.write(`[proxy-warn] script fallback failed, trying python bridge: ${scriptError.message}\n`);
        }
      }

      if (!term) {
        try {
          term = spawnPythonBridge(
            {
              cwd: payload.cwd,
              env: fallbackEnv
            },
            launches
          );
          process.stderr.write("[proxy-info] python PTY bridge fallback started\n");
        } catch (pythonError) {
          process.stderr.write(`[proxy-warn] python bridge failed, trying direct pipe: ${pythonError.message}\n`);
          try {
            term = spawnPipeWithFallback(launches, {
              cwd: payload.cwd,
              env: fallbackEnv
            });
            process.stderr.write("[proxy-info] direct pipe fallback started\n");
          } catch (pipeError) {
            if (scriptLaunches.length === 0) {
              process.stderr.write(`[proxy-error] ${pipeError.message}\n`);
              process.exit(1);
              return;
            }

            process.stderr.write(`[proxy-warn] direct pipe failed, trying system 'script': ${pipeError.message}\n`);
            try {
              term = spawnPipeWithFallback(scriptLaunches, {
                cwd: payload.cwd,
                env: fallbackEnv
              });
            } catch (scriptError) {
              process.stderr.write(`[proxy-error] ${scriptError.message}\n`);
              process.exit(1);
              return;
            }
          }
        }
      }
      process.stderr.write(`[proxy-info] fallback process started (pid=${term.pid})\n`);
    } catch (outerError) {
      process.stderr.write(`[proxy-error] ${outerError.message}\n`);
      process.exit(1);
      return;
    } 
  }

  if (mode === "pty") {
    term.onData((data) => {
      process.stdout.write(data);
    });

    term.onExit(({ exitCode }) => {
      process.exit(exitCode ?? 0);
    });

    process.stdin.on("data", (chunk) => {
      term.write(chunk.toString("utf8"));
    });
    process.stdin.resume();
  } else {
    term.stdout.on("data", (chunk) => {
      process.stdout.write(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });
    term.stderr.on("data", (chunk) => {
      process.stdout.write(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });
    term.on("exit", (code) => {
      process.exit(code ?? 0);
    });
    process.stdin.on("data", (chunk) => {
      if (term.stdin.writable) {
        term.stdin.write(chunk);
      }
    });
    process.stdin.resume();
  }

  process.on("message", (message) => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (mode === "pty" && message.type === "resize") {
      const cols = Math.max(20, Number(message.cols) || 120);
      const rows = Math.max(10, Number(message.rows) || 30);
      try {
        term.resize(cols, rows);
      } catch {
        // Ignore resize errors.
      }
    }
  });

  const shutdown = () => {
    try {
      term.kill("SIGTERM");
    } catch {
      // Ignore shutdown errors.
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  process.stderr.write(`[proxy-fatal] ${error.message}\n`);
  process.exit(1);
});
