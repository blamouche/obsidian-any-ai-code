import { App, FileSystemAdapter, ItemView, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import type { ChildProcess } from "child_process";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  detectNodeExecutable,
  mergePathEntries as mergePathEntriesForPlatform,
  resolvePluginDir as resolvePluginDirWithVault
} from "./runtime-utils";

const VIEW_TYPE_CLAUDE = "claude-cli-view";

interface ClaudeCliPluginSettings {
  command: string;
  autoStart: boolean;
  nodeExecutable: string;
}

const DEFAULT_SETTINGS: ClaudeCliPluginSettings = {
  command: "claude",
  autoStart: true,
  nodeExecutable: "auto"
};

interface ProcessAdapter {
  write(data: string): void;
  resize?(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (exitCode: number, signal: string) => void): void;
}

class ClaudeCliView extends ItemView {
  private plugin: ClaudeCliPlugin;
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private processHandle: ProcessAdapter | null = null;
  private terminalHostEl: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private statusEl: HTMLDivElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ClaudeCliPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CLAUDE;
  }

  getDisplayText(): string {
    return "Claude Code";
  }

  getIcon(): string {
    return "terminal";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("claude-cli-view");

    const toolbarEl = this.contentEl.createDiv({ cls: "claude-cli-toolbar" });
    const startBtn = toolbarEl.createEl("button", { text: "Start" });
    const stopBtn = toolbarEl.createEl("button", { text: "Stop" });
    const restartBtn = toolbarEl.createEl("button", { text: "Restart" });
    const clearBtn = toolbarEl.createEl("button", { text: "Clear" });
    this.statusEl = this.contentEl.createDiv({ cls: "claude-cli-status" });

    startBtn.addEventListener("click", () => this.startClaudeProcess());
    stopBtn.addEventListener("click", () => this.stopClaudeProcess());
    restartBtn.addEventListener("click", async () => {
      this.stopClaudeProcess();
      await this.startClaudeProcess();
    });
    clearBtn.addEventListener("click", () => this.terminal?.clear());

    this.terminalHostEl = this.contentEl.createDiv({ cls: "claude-cli-terminal" });

    this.terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
      fontSize: 13,
      scrollback: 3000,
      theme: {
        background: "#0f1115",
        foreground: "#e6e6e6"
      }
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(this.terminalHostEl);
    this.fitAddon.fit();
    this.terminal.writeln("Claude panel ready.");

    this.terminal.onData((data) => {
      this.processHandle?.write(data);
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.fitAddon?.fit();
      if (this.processHandle && this.terminal) {
        this.processHandle.resize?.(
          Math.max(20, this.terminal.cols || 120),
          Math.max(10, this.terminal.rows || 30)
        );
      }
    });
    this.resizeObserver.observe(this.contentEl);

    if (this.plugin.settings.autoStart) {
      await this.startClaudeProcess();
    } else {
      this.terminal.writeln("Auto-start is disabled. Click Start to launch Claude.");
      this.setStatus("Idle");
    }
  }

  async onClose(): Promise<void> {
    this.stopClaudeProcess();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
    this.statusEl = null;
  }

  async startClaudeProcess(): Promise<void> {
    if (!this.terminal) {
      return;
    }
    if (this.processHandle) {
      this.terminal.writeln("[Claude process is already running]");
      this.setStatus("Already running");
      return;
    }

    const command = this.plugin.settings.command.trim();

    this.terminal.writeln(`[Starting: ${command}]`);
    this.setStatus(`Starting in vault folder (${process.platform})...`);

    try {
      const vaultPath = getVaultBasePath(this.app);
      if (!vaultPath) {
        const message = "Unable to resolve current vault path. Claude was not started.";
        this.terminal.writeln(`[${message}]`);
        this.setStatus(message);
        new Notice(message, 6000);
        return;
      }
      const fs = require("fs") as typeof import("fs");
      if (!fs.existsSync(vaultPath)) {
        const message = `Vault path does not exist: ${vaultPath}`;
        this.terminal.writeln(`[${message}]`);
        this.setStatus(message);
        new Notice(message, 6000);
        return;
      }

      const helperHandle = spawnPtyProxy({
        command,
        cwd: vaultPath,
        env: getShellEnv(),
        cols: Math.max(20, this.terminal.cols || 120),
        rows: Math.max(10, this.terminal.rows || 30),
        nodeExecutable: this.plugin.settings.nodeExecutable,
        pluginDir: this.plugin.manifest.dir,
        vaultPath
      });
      this.processHandle = makeProxyAdapter(helperHandle);
    } catch (error) {
      const message = `Failed to start process: ${(error as Error).message}`;
      this.terminal.writeln(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 7000);
      this.processHandle = null;
      return;
    }
    this.setStatus("Running");

    this.processHandle.onData((data: string) => {
      this.terminal?.write(data);
    });

    this.processHandle.onExit((exitCode, signal) => {
      const message = `Process exited (code=${exitCode}, signal=${signal})`;
      this.terminal?.writeln(`[${message}]`);
      this.setStatus(message);
      this.processHandle = null;
    });

    this.fitAddon?.fit();
  }

  stopClaudeProcess(): void {
    if (!this.processHandle) {
      return;
    }

    this.terminal?.writeln("[Stopping Claude process...]");
    this.setStatus("Stopping...");
    try {
      this.processHandle.kill("SIGTERM");
    } catch (error) {
      const message = `Failed to stop process: ${(error as Error).message}`;
      this.terminal?.writeln(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 6000);
    }
  }

  private setStatus(message: string): void {
    this.statusEl?.setText(`Status: ${message}`);
  }
}

export default class ClaudeCliPlugin extends Plugin {
  settings!: ClaudeCliPluginSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_CLAUDE, (leaf) => new ClaudeCliView(leaf, this));

    this.addRibbonIcon("terminal", "Open Claude Code panel", async () => {
      await this.activateView();
    });

    this.addCommand({
      id: "open-claude-code-panel",
      name: "Open Claude Code panel",
      callback: async () => {
        await this.activateView();
      }
    });

    this.addSettingTab(new ClaudeCliSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE).forEach((leaf) => leaf.detach());
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CLAUDE)[0];

    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({
        type: VIEW_TYPE_CLAUDE,
        active: true
      });
    }

    workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class ClaudeCliSettingTab extends PluginSettingTab {
  plugin: ClaudeCliPlugin;

  constructor(app: App, plugin: ClaudeCliPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Command")
      .setDesc("Command used to launch Claude Code in the embedded terminal.")
      .addText((text) =>
        text
          .setPlaceholder("claude")
          .setValue(this.plugin.settings.command)
          .onChange(async (value) => {
            this.plugin.settings.command = value.trim() || "claude";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-start")
      .setDesc("Automatically start Claude when the panel opens.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoStart)
          .onChange(async (value) => {
            this.plugin.settings.autoStart = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Node executable")
      .setDesc("Optional override for PTY proxy Node runtime. Leave as 'auto' for automatic detection.")
      .addText((text) =>
        text
          .setPlaceholder("auto")
          .setValue(this.plugin.settings.nodeExecutable)
          .onChange(async (value) => {
            this.plugin.settings.nodeExecutable = value.trim() || "auto";
            await this.plugin.saveSettings();
          })
      );
  }
}

function resolvePluginDir(
  pluginDir: string | undefined,
  vaultBasePath: string | undefined,
  path: typeof import("path")
): string | undefined {
  return resolvePluginDirWithVault(pluginDir, vaultBasePath, path);
}

function getVaultBasePath(app: App): string | undefined {
  const adapter = app.vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    return adapter.getBasePath();
  }
  return undefined;
}

function getShellEnv(): NodeJS.ProcessEnv {
  const path = require("path") as typeof import("path");
  const os = require("os") as typeof import("os");
  const fs = require("fs") as typeof import("fs");
  const home = os.homedir();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: "xterm-256color"
  };

  const extraPaths: string[] = [];
  if (process.platform === "darwin") {
    extraPaths.push(
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin"
    );
  } else if (process.platform === "linux") {
    extraPaths.push(
      "/usr/local/sbin",
      "/usr/local/bin",
      "/usr/sbin",
      "/usr/bin",
      "/sbin",
      "/bin"
    );
  } else if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    const userProfile = process.env.USERPROFILE;
    if (appData) extraPaths.push(path.join(appData, "npm"));
    if (localAppData) extraPaths.push(path.join(localAppData, "Microsoft", "WindowsApps"));
    if (userProfile) extraPaths.push(path.join(userProfile, "scoop", "shims"));
  }

  if (home) {
    extraPaths.push(
      path.join(home, ".local", "bin"),
      path.join(home, ".npm-global", "bin"),
      path.join(home, ".volta", "bin"),
      path.join(home, ".asdf", "shims"),
      path.join(home, "Library", "pnpm"),
      path.join(home, ".local", "share", "pnpm")
    );

    const nvmVersionsDir = path.join(home, ".nvm", "versions", "node");
    if (fs.existsSync(nvmVersionsDir)) {
      try {
        const versions = fs.readdirSync(nvmVersionsDir, { withFileTypes: true });
        for (const version of versions) {
          if (version.isDirectory()) {
            extraPaths.push(path.join(nvmVersionsDir, version.name, "bin"));
          }
        }
      } catch {
        // Ignore filesystem errors for optional PATH discovery.
      }
    }
  }

  env.PATH = mergePathEntries(env.PATH, extraPaths);
  return env;
}

function mergePathEntries(currentPath: string | undefined, extras: string[]): string {
  return mergePathEntriesForPlatform(currentPath, extras, process.platform);
}

function spawnPtyProxy(params: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  cols: number;
  rows: number;
  nodeExecutable: string;
  pluginDir?: string;
  vaultPath?: string;
}): ChildProcess {
  const { spawn } = require("child_process") as typeof import("child_process");
  const path = require("path") as typeof import("path");
  const resolvedPluginDir = resolvePluginDir(params.pluginDir, params.vaultPath, path);
  const scriptPath = resolvedPluginDir
    ? path.join(resolvedPluginDir, "pty-proxy.js")
    : path.resolve("pty-proxy.js");
  const fsApi = require("fs") as typeof import("fs");

  if (!fsApi.existsSync(scriptPath)) {
    throw new Error(`Missing proxy script: ${scriptPath}`);
  }

  const payload = Buffer.from(
    JSON.stringify({
      command: params.command,
      cwd: params.cwd,
      env: params.env,
      cols: params.cols,
      rows: params.rows
    }),
    "utf8"
  ).toString("base64");

  const fs = require("fs") as typeof import("fs");
  const nodePath = require("path") as typeof import("path");
  const nodeExecutable = detectNodeExecutable(
    params.nodeExecutable,
    process.platform,
    params.env,
    fs.existsSync,
    nodePath
  );
  return spawn(nodeExecutable, [scriptPath, payload], {
    cwd: params.cwd,
    env: params.env,
    stdio: ["pipe", "pipe", "pipe", "ipc"]
  });
}

function makeProxyAdapter(handle: ChildProcess): ProcessAdapter {
  return {
    write(data: string) {
      if (handle.stdin?.writable) {
        handle.stdin.write(data);
      }
    },
    resize(cols: number, rows: number) {
      if (typeof handle.send === "function") {
        handle.send({ type: "resize", cols, rows });
      }
    },
    kill(signal?: string) {
      handle.kill(signal as NodeJS.Signals | number | undefined);
    },
    onData(callback: (data: string) => void) {
      handle.stdout?.on("data", (chunk: Buffer | string) => {
        callback(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      });
      handle.stderr?.on("data", (chunk: Buffer | string) => {
        callback(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      });
    },
    onExit(callback: (exitCode: number, signal: string) => void) {
      handle.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
        callback(code ?? -1, signal ?? "none");
      });
    }
  };
}
