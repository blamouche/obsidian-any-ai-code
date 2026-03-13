import { App, FileSystemAdapter, ItemView, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import type { ChildProcess } from "child_process";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  detectNodeExecutable,
  formatActiveFileMention,
  mergePathEntries as mergePathEntriesForPlatform,
  resolvePluginDir as resolvePluginDirWithVault
} from "./runtime-utils";

const VIEW_TYPE_CLAUDE = "claude-cli-view";
type CliRuntime = "claude" | "codex";

interface ClaudeCliPluginSettings {
  command: string;
  autoStart: boolean;
  nodeExecutable: string;
  runtime: CliRuntime;
}

const DEFAULT_SETTINGS: ClaudeCliPluginSettings = {
  command: "claude",
  autoStart: true,
  nodeExecutable: "auto",
  runtime: "claude"
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
  private runtimeButtons: Record<CliRuntime, HTMLButtonElement> | null = null;
  private runningRuntime: CliRuntime | null = null;
  private pendingStartRuntime: CliRuntime | null = null;

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
    const mentionBtn = toolbarEl.createEl("button", { text: "@Fichier actif" });
    const runtimeToggleEl = toolbarEl.createDiv({ cls: "claude-cli-runtime-toggle" });
    const claudeBtn = runtimeToggleEl.createEl("button", { text: "Claude" });
    const codexBtn = runtimeToggleEl.createEl("button", { text: "Codex" });
    this.runtimeButtons = { claude: claudeBtn, codex: codexBtn };
    this.updateRuntimeButtons();
    this.statusEl = this.contentEl.createDiv({ cls: "claude-cli-status" });

    startBtn.addEventListener("click", () => this.startClaudeProcess());
    stopBtn.addEventListener("click", () => this.stopClaudeProcess());
    restartBtn.addEventListener("click", () => this.restartClaudeProcess());
    clearBtn.addEventListener("click", () => this.terminal?.clear());
    mentionBtn.addEventListener("click", () => this.insertActiveFileMention());
    claudeBtn.addEventListener("click", () => this.setRuntime("claude"));
    codexBtn.addEventListener("click", () => this.setRuntime("codex"));

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
    this.terminal.writeln("CLI panel ready.");

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
      this.terminal.writeln(`Auto-start is disabled. Click Start to launch ${this.getRuntimeLabel()}.`);
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

  async startClaudeProcess(runtimeOverride?: CliRuntime): Promise<void> {
    if (!this.terminal) {
      return;
    }
    const targetRuntime = runtimeOverride ?? this.plugin.settings.runtime;
    const targetLabel = this.getRuntimeLabel(targetRuntime);

    if (this.processHandle) {
      if (this.runningRuntime === targetRuntime) {
        this.terminal.writeln(`[${targetLabel} process is already running]`);
        this.setStatus("Already running");
      } else {
        this.pendingStartRuntime = targetRuntime;
        this.terminal.writeln(`[Switch requested: ${targetLabel}. Stopping current process first...]`);
        this.stopClaudeProcess(true);
      }
      return;
    }

    const runtimeLabel = this.getRuntimeLabel(targetRuntime);
    const command = this.getRuntimeCommand(targetRuntime);
    if (targetRuntime === "codex") {
      this.resetTerminalDisplay();
    }

    this.terminal.writeln(`[Starting: ${command}]`);
    this.setStatus(`Starting in vault folder (${process.platform})...`);

    try {
      const vaultPath = getVaultBasePath(this.app);
      if (!vaultPath) {
        const message = `Unable to resolve current vault path. ${runtimeLabel} was not started.`;
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

      const shellEnv = getShellEnv();
      if (targetRuntime === "codex") {
        // Keep Codex output readable in embedded terminals.
        shellEnv.NO_COLOR = "1";
        shellEnv.CLICOLOR = "0";
        shellEnv.FORCE_COLOR = "0";
      }

      const helperHandle = spawnPtyProxy({
        command,
        cwd: vaultPath,
        env: shellEnv,
        cols: Math.max(20, this.terminal.cols || 120),
        rows: Math.max(10, this.terminal.rows || 30),
        nodeExecutable: this.plugin.settings.nodeExecutable,
        pluginDir: this.plugin.manifest.dir,
        vaultPath
      });
      this.processHandle = makeProxyAdapter(helperHandle);
      this.runningRuntime = targetRuntime;
    } catch (error) {
      const message = `Failed to start process: ${(error as Error).message}`;
      this.terminal.writeln(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 7000);
      this.processHandle = null;
      this.runningRuntime = null;
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
      this.runningRuntime = null;
      const nextRuntime = this.pendingStartRuntime;
      this.pendingStartRuntime = null;
      if (nextRuntime) {
        void this.startClaudeProcess(nextRuntime);
      }
    });

    this.fitAddon?.fit();
  }

  stopClaudeProcess(preservePendingStart = false): void {
    if (!this.processHandle) {
      return;
    }
    if (!preservePendingStart) {
      this.pendingStartRuntime = null;
    }

    this.terminal?.writeln(`[Stopping ${this.getRunningRuntimeLabel()} process...]`);
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

  private getRuntimeLabel(runtime: CliRuntime = this.plugin.settings.runtime): string {
    return runtime === "codex" ? "Codex" : "Claude";
  }

  private getRunningRuntimeLabel(): string {
    if (!this.runningRuntime) {
      return this.getRuntimeLabel();
    }
    return this.getRuntimeLabel(this.runningRuntime);
  }

  private getRuntimeCommand(runtime: CliRuntime = this.plugin.settings.runtime): string {
    if (runtime === "codex") {
      // Embedded xterm can render a blank alternate screen with Codex TUI.
      // Run inline mode to keep output visible in this panel.
      return "codex --no-alt-screen -c check_for_update_on_startup=false -c hide_full_access_warning=true -c hide_world_writable_warning=true -c hide_rate_limit_model_nudge=true";
    }
    return this.plugin.settings.command.trim();
  }

  private restartClaudeProcess(): void {
    const targetRuntime = this.plugin.settings.runtime;
    if (!this.processHandle) {
      void this.startClaudeProcess(targetRuntime);
      return;
    }
    this.pendingStartRuntime = targetRuntime;
    this.terminal?.writeln(`[Restart requested: ${this.getRuntimeLabel(targetRuntime)}]`);
    this.stopClaudeProcess(true);
  }

  private resetTerminalDisplay(): void {
    if (!this.terminal) {
      return;
    }

    this.terminal.reset();
    this.fitAddon?.fit();
  }

  private setRuntime(runtime: CliRuntime): void {
    if (this.plugin.settings.runtime === runtime) {
      return;
    }

    this.plugin.settings.runtime = runtime;
    void this.plugin.saveSettings();
    this.updateRuntimeButtons();

    const selectedLabel = this.getRuntimeLabel();
    this.terminal?.writeln(`[Runtime selected: ${selectedLabel}]`);
    if (this.processHandle) {
      this.setStatus(`${selectedLabel} selected (restart to apply)`);
      return;
    }
    this.setStatus(`${selectedLabel} selected`);
  }

  private updateRuntimeButtons(): void {
    if (!this.runtimeButtons) {
      return;
    }

    this.runtimeButtons.claude.toggleClass("is-active", this.plugin.settings.runtime === "claude");
    this.runtimeButtons.codex.toggleClass("is-active", this.plugin.settings.runtime === "codex");
  }

  private insertActiveFileMention(): void {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      const message = "No active file detected.";
      this.terminal?.writeln(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 4000);
      return;
    }
    if (!this.processHandle) {
      const message = `${this.getRuntimeLabel()} process is not running. Start it before inserting a file mention.`;
      this.terminal?.writeln(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 5000);
      return;
    }

    const mention = formatActiveFileMention(activeFile.path);
    this.processHandle.write(mention);
    this.terminal?.focus();
    this.setStatus(`Inserted ${mention.trim()}`);
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
  const dataCallbacks: Array<(data: string) => void> = [];
  const exitCallbacks: Array<(exitCode: number, signal: string) => void> = [];
  const pendingData: string[] = [];
  let pendingExit: { code: number; signal: string } | null = null;

  const emitData = (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (dataCallbacks.length === 0) {
      pendingData.push(text);
      return;
    }
    dataCallbacks.forEach((callback) => callback(text));
  };

  const emitExit = (code: number | null, signal: NodeJS.Signals | null) => {
    const exitCode = code ?? -1;
    const exitSignal = signal ?? "none";
    if (exitCallbacks.length === 0) {
      pendingExit = { code: exitCode, signal: exitSignal };
      return;
    }
    exitCallbacks.forEach((callback) => callback(exitCode, exitSignal));
  };

  handle.stdout?.on("data", emitData);
  handle.stderr?.on("data", emitData);
  handle.on("exit", emitExit);

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
      dataCallbacks.push(callback);
      if (pendingData.length > 0) {
        pendingData.splice(0, pendingData.length).forEach((chunk) => callback(chunk));
      }
    },
    onExit(callback: (exitCode: number, signal: string) => void) {
      exitCallbacks.push(callback);
      if (pendingExit) {
        callback(pendingExit.code, pendingExit.signal);
        pendingExit = null;
      }
    }
  };
}
