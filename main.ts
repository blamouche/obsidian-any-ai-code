import { App, FileSystemAdapter, ItemView, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, setIcon } from "obsidian";
import { spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  defaultGenerateRuntimeId,
  detectNodeExecutable,
  formatActiveFileMention,
  formatActiveFolderMention,
  isCodexLikeCommand,
  mergePathEntries as mergePathEntriesForPlatform,
  migrateRuntimeSettings,
  resolvePluginDir as resolvePluginDirWithVault,
  type CliRuntimeConfig
} from "./runtime-utils";

const VIEW_TYPE_CLAUDE = "claude-cli-view";

const CODEX_DEFAULT_COMMAND =
  "codex --no-alt-screen -c check_for_update_on_startup=false -c hide_full_access_warning=true -c hide_world_writable_warning=true -c hide_rate_limit_model_nudge=true";

const DEFAULT_RUNTIMES: CliRuntimeConfig[] = [
  { id: "claude", name: "Claude", command: "claude" },
  { id: "codex", name: "Codex", command: CODEX_DEFAULT_COMMAND }
];

interface ClaudeCliPluginSettings {
  runtimes: CliRuntimeConfig[];
  selectedRuntimeId: string;
  autoRestartOnRuntimeSwitch: boolean;
  autoStart: boolean;
  nodeExecutable: string;
}

const DEFAULT_SETTINGS: ClaudeCliPluginSettings = {
  runtimes: DEFAULT_RUNTIMES.map((runtime) => ({ ...runtime })),
  selectedRuntimeId: "claude",
  autoRestartOnRuntimeSwitch: true,
  autoStart: true,
  nodeExecutable: "auto"
};

function cloneDefaultRuntimes(): CliRuntimeConfig[] {
  return DEFAULT_RUNTIMES.map((runtime) => ({ ...runtime }));
}

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
  private runtimeSelect: HTMLSelectElement | null = null;
  private runningRuntimeId: string | null = null;
  private pendingStartRuntimeId: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ClaudeCliPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CLAUDE;
  }

  getDisplayText(): string {
    return "Any AI CLI";
  }

  getIcon(): string {
    return "bot";
  }

  onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("claude-cli-view");

    const toolbarEl = this.contentEl.createDiv({ cls: "claude-cli-toolbar" });

    const primaryRowEl = toolbarEl.createDiv({ cls: "claude-cli-toolbar-row" });
    const runtimePickerEl = primaryRowEl.createDiv({ cls: "claude-cli-runtime-picker" });
    const runtimeIconEl = runtimePickerEl.createSpan({ cls: "claude-cli-runtime-picker-icon" });
    setIcon(runtimeIconEl, "terminal");
    this.runtimeSelect = runtimePickerEl.createEl("select", { cls: "claude-cli-runtime-select" });
    this.runtimeSelect.setAttribute("aria-label", "Select runtime");
    this.refreshRuntimeSelect();
    const runtimeChevronEl = runtimePickerEl.createSpan({ cls: "claude-cli-runtime-picker-chevron" });
    setIcon(runtimeChevronEl, "chevron-down");
    const startBtn = primaryRowEl.createEl("button", { text: "Start" });
    const stopBtn = primaryRowEl.createEl("button", { text: "Stop" });
    const restartBtn = primaryRowEl.createEl("button", { text: "Restart" });
    const clearBtn = primaryRowEl.createEl("button", { text: "Clear" });
    this.setButtonIcon(startBtn, "play", "Start");
    this.setButtonIcon(stopBtn, "square", "Stop");
    this.setButtonIcon(restartBtn, "refresh-cw", "Restart");
    this.setButtonIcon(clearBtn, "eraser", "Clear");
    startBtn.addClass("claude-cli-btn-primary");
    stopBtn.addClass("claude-cli-btn-danger");

    const secondaryRowEl = toolbarEl.createDiv({ cls: "claude-cli-toolbar-row" });
    const mentionBtn = secondaryRowEl.createEl("button", { text: "@Active file" });
    const folderMentionBtn = secondaryRowEl.createEl("button", { text: "@Active folder" });
    this.setButtonIcon(mentionBtn, "file-plus", "@Active file");
    this.setButtonIcon(folderMentionBtn, "folder-plus", "@Active folder");
    mentionBtn.addClass("claude-cli-btn-info");
    folderMentionBtn.addClass("claude-cli-btn-info");

    this.statusEl = this.contentEl.createDiv({ cls: "claude-cli-status" });

    startBtn.addEventListener("click", () => this.startClaudeProcess());
    stopBtn.addEventListener("click", () => this.stopClaudeProcess());
    restartBtn.addEventListener("click", () => this.restartClaudeProcess());
    clearBtn.addEventListener("click", () => this.terminal?.clear());
    mentionBtn.addEventListener("click", () => this.insertActiveFileMention());
    folderMentionBtn.addEventListener("click", () => this.insertActiveFolderMention());
    this.runtimeSelect.addEventListener("change", () => {
      if (this.runtimeSelect) {
        this.setRuntime(this.runtimeSelect.value);
      }
    });

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
    this.writeSystemLine("CLI panel ready.");

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
      this.startClaudeProcess();
    } else {
      this.writeSystemLine(`Auto-start is disabled. Click start to launch ${this.getRuntimeLabel()}.`);
      this.setStatus("Idle");
    }

    return Promise.resolve();
  }

  refreshRuntimeSelect(): void {
    if (!this.runtimeSelect) {
      return;
    }
    this.runtimeSelect.empty();
    const runtimes = this.plugin.settings.runtimes;
    if (runtimes.length === 0) {
      const placeholder = this.runtimeSelect.createEl("option", { text: "(no runtime configured)" });
      placeholder.value = "";
      this.runtimeSelect.value = "";
      this.runtimeSelect.disabled = true;
      return;
    }
    this.runtimeSelect.disabled = false;
    for (const runtime of runtimes) {
      const opt = this.runtimeSelect.createEl("option", { text: runtime.name || "(unnamed)" });
      opt.value = runtime.id;
    }
    const validSelection = runtimes.some((r) => r.id === this.plugin.settings.selectedRuntimeId);
    this.runtimeSelect.value = validSelection
      ? this.plugin.settings.selectedRuntimeId
      : runtimes[0].id;
  }

  onClose(): Promise<void> {
    this.stopClaudeProcess();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
    this.statusEl = null;
    return Promise.resolve();
  }

  startClaudeProcess(runtimeIdOverride?: string): void {
    if (!this.terminal) {
      return;
    }
    const targetRuntime = runtimeIdOverride
      ? this.plugin.settings.runtimes.find((r) => r.id === runtimeIdOverride)
      : this.getSelectedRuntime();
    if (!targetRuntime) {
      const message = "No runtime configured. Add one in plugin settings.";
      this.writeSystemLine(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 6000);
      return;
    }

    const targetLabel = targetRuntime.name || "(unnamed runtime)";

    if (this.processHandle) {
      if (this.runningRuntimeId === targetRuntime.id) {
        this.writeSystemLine(`[${targetLabel} process is already running]`);
        this.setStatus("Already running");
      } else {
        this.pendingStartRuntimeId = targetRuntime.id;
        this.writeSystemLine(`[Switch requested: ${targetLabel}. Stopping current process first...]`);
        this.stopClaudeProcess(true);
      }
      return;
    }

    const command = (targetRuntime.command || "").trim();
    if (!command) {
      const message = `Runtime "${targetLabel}" has an empty command. Set one in plugin settings.`;
      this.writeSystemLine(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 6000);
      return;
    }

    const codexLike = isCodexLikeCommand(command);
    if (codexLike) {
      this.resetTerminalDisplay();
    }

    this.writeSystemLine(`[Starting: ${command}]`);
    this.setStatus(`Starting in vault folder (${process.platform})...`);

    try {
      const vaultPath = getVaultBasePath(this.app);
      if (!vaultPath) {
        const message = `Unable to resolve current vault path. ${targetLabel} was not started.`;
        this.writeSystemLine(`[${message}]`);
        this.setStatus(message);
        new Notice(message, 6000);
        return;
      }
      if (!fs.existsSync(vaultPath)) {
        const message = `Vault path does not exist: ${vaultPath}`;
        this.writeSystemLine(`[${message}]`);
        this.setStatus(message);
        new Notice(message, 6000);
        return;
      }

      const shellEnv = getShellEnv();
      if (codexLike) {
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
      this.runningRuntimeId = targetRuntime.id;
    } catch (error) {
      const message = `Failed to start process: ${(error as Error).message}`;
      this.writeSystemLine(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 7000);
      this.processHandle = null;
      this.runningRuntimeId = null;
      return;
    }
    this.setStatus("Running");

    this.processHandle.onData((data: string) => {
      this.terminal?.write(data);
    });

    this.processHandle.onExit((exitCode, signal) => {
      const message = `Process exited (code=${exitCode}, signal=${signal})`;
      this.writeSystemLine(`[${message}]`);
      this.setStatus(message);
      this.processHandle = null;
      this.runningRuntimeId = null;
      const nextRuntimeId = this.pendingStartRuntimeId;
      this.pendingStartRuntimeId = null;
      if (nextRuntimeId) {
        void this.startClaudeProcess(nextRuntimeId);
      }
    });

    this.fitAddon?.fit();
  }

  stopClaudeProcess(preservePendingStart = false): void {
    if (!this.processHandle) {
      return;
    }
    if (!preservePendingStart) {
      this.pendingStartRuntimeId = null;
    }

    this.writeSystemLine(`[Stopping ${this.getRunningRuntimeLabel()} process...]`);
    this.setStatus("Stopping...");
    try {
      this.processHandle.kill("SIGTERM");
    } catch (error) {
      const message = `Failed to stop process: ${(error as Error).message}`;
      this.writeSystemLine(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 6000);
    }
  }

  private setStatus(message: string): void {
    this.statusEl?.setText(`Status: ${message}`);
  }

  private getSelectedRuntime(): CliRuntimeConfig | null {
    const { runtimes, selectedRuntimeId } = this.plugin.settings;
    return (
      runtimes.find((r) => r.id === selectedRuntimeId) ??
      runtimes[0] ??
      null
    );
  }

  private getRuntimeLabel(runtimeId?: string): string {
    if (runtimeId) {
      const match = this.plugin.settings.runtimes.find((r) => r.id === runtimeId);
      return match?.name || "(unnamed runtime)";
    }
    return this.getSelectedRuntime()?.name || "(no runtime)";
  }

  private getRunningRuntimeLabel(): string {
    if (!this.runningRuntimeId) {
      return this.getRuntimeLabel();
    }
    return this.getRuntimeLabel(this.runningRuntimeId);
  }

  private restartClaudeProcess(): void {
    const target = this.getSelectedRuntime();
    if (!target) {
      void this.startClaudeProcess();
      return;
    }
    if (!this.processHandle) {
      void this.startClaudeProcess(target.id);
      return;
    }
    this.pendingStartRuntimeId = target.id;
    this.writeSystemLine(`[Restart requested: ${target.name}]`);
    this.stopClaudeProcess(true);
  }

  private resetTerminalDisplay(): void {
    if (!this.terminal) {
      return;
    }

    this.terminal.reset();
    this.fitAddon?.fit();
  }

  private setRuntime(runtimeId: string): void {
    if (!runtimeId) {
      return;
    }
    const exists = this.plugin.settings.runtimes.some((r) => r.id === runtimeId);
    if (!exists) {
      this.refreshRuntimeSelect();
      return;
    }
    if (this.plugin.settings.selectedRuntimeId === runtimeId) {
      return;
    }

    this.plugin.settings.selectedRuntimeId = runtimeId;
    void this.plugin.saveSettings();
    this.refreshRuntimeSelect();

    const selectedLabel = this.getRuntimeLabel();
    this.writeSystemLine(`[Runtime selected: ${selectedLabel}]`);
    if (this.processHandle) {
      if (this.plugin.settings.autoRestartOnRuntimeSwitch) {
        this.setStatus(`Restarting to ${selectedLabel}...`);
        this.restartClaudeProcess();
        return;
      }
      this.setStatus(`${selectedLabel} selected (restart to apply)`);
      return;
    }
    this.setStatus(`${selectedLabel} selected`);
  }

  private insertActiveFileMention(): void {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      const message = "No active file detected.";
      this.writeSystemLine(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 4000);
      return;
    }
    if (!this.processHandle) {
      const message = `${this.getRuntimeLabel()} process is not running. Start it before inserting a file mention.`;
      this.writeSystemLine(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 5000);
      return;
    }

    const mention = formatActiveFileMention(activeFile.path);
    this.processHandle.write(mention);
    this.terminal?.focus();
    this.setStatus(`Inserted ${mention.trim()}`);
  }

  private insertActiveFolderMention(): void {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      const message = "No active file detected.";
      this.writeSystemLine(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 4000);
      return;
    }
    if (!this.processHandle) {
      const message = `${this.getRuntimeLabel()} process is not running. Start it before inserting a folder mention.`;
      this.writeSystemLine(`[${message}]`);
      this.setStatus(message);
      new Notice(message, 5000);
      return;
    }

    const mention = formatActiveFolderMention(activeFile.path);
    this.processHandle.write(mention);
    this.terminal?.focus();
    this.setStatus(`Inserted ${mention.trim()}`);
  }

  private writeSystemLine(message: string): void {
    if (!this.terminal) {
      return;
    }
    this.terminal.write("\r\u001b[2K");
    this.terminal.writeln(message);
  }

  private setButtonIcon(buttonEl: HTMLButtonElement, iconName: string, label: string): void {
    buttonEl.empty();
    buttonEl.addClass("claude-cli-btn");
    const iconEl = buttonEl.createSpan({ cls: "claude-cli-btn-icon" });
    setIcon(iconEl, iconName);
    buttonEl.createSpan({ text: label });
  }
}

export default class ClaudeCliPlugin extends Plugin {
  settings!: ClaudeCliPluginSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_CLAUDE, (leaf) => new ClaudeCliView(leaf, this));

    this.addRibbonIcon("bot", "Open Any AI CLI", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-panel",
      name: "Open Any AI CLI",
      callback: () => {
        void this.activateView();
      }
    });

    this.addSettingTab(new ClaudeCliSettingTab(this.app, this));
  }

  onunload(): void {
    // Per Obsidian plugin guidelines, do not detach leaves on unload —
    // Obsidian preserves leaf state across reloads/updates.
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_CLAUDE)[0] ?? null;

    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) {
        return;
      }
      await leaf.setViewState({
        type: VIEW_TYPE_CLAUDE,
        active: true
      });
    }

    workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    const raw = ((await this.loadData()) ?? {}) as Record<string, unknown>;
    const { runtimes, selectedRuntimeId } = migrateRuntimeSettings(raw, cloneDefaultRuntimes());
    this.settings = {
      runtimes,
      selectedRuntimeId,
      autoRestartOnRuntimeSwitch:
        typeof raw.autoRestartOnRuntimeSwitch === "boolean"
          ? raw.autoRestartOnRuntimeSwitch
          : DEFAULT_SETTINGS.autoRestartOnRuntimeSwitch,
      autoStart:
        typeof raw.autoStart === "boolean" ? raw.autoStart : DEFAULT_SETTINGS.autoStart,
      nodeExecutable:
        typeof raw.nodeExecutable === "string" && raw.nodeExecutable.trim()
          ? raw.nodeExecutable
          : DEFAULT_SETTINGS.nodeExecutable
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  notifyRuntimesChanged(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof ClaudeCliView) {
        view.refreshRuntimeSelect();
      }
    });
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
      .setName("Default runtime")
      .setDesc("Runtime selected by default when opening the panel (and used by auto-start).")
      .addDropdown((dropdown) => {
        const runtimes = this.plugin.settings.runtimes;
        if (runtimes.length === 0) {
          dropdown.addOption("", "(no runtime configured)");
          dropdown.setDisabled(true);
        } else {
          for (const runtime of runtimes) {
            dropdown.addOption(runtime.id, runtime.name || "(unnamed)");
          }
          const validSelection = runtimes.some((r) => r.id === this.plugin.settings.selectedRuntimeId);
          dropdown.setValue(
            validSelection ? this.plugin.settings.selectedRuntimeId : runtimes[0].id
          );
        }
        dropdown.onChange(async (value) => {
          if (!value) {
            return;
          }
          this.plugin.settings.selectedRuntimeId = value;
          await this.plugin.saveSettings();
          this.plugin.notifyRuntimesChanged();
        });
      });

    new Setting(containerEl)
      .setName("Auto-start")
      .setDesc("Automatically start the selected default runtime when the panel opens.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoStart)
          .onChange(async (value) => {
            this.plugin.settings.autoStart = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-restart on runtime switch")
      .setDesc("Automatically restart the running process when changing the runtime from the sidebar dropdown.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoRestartOnRuntimeSwitch)
          .onChange(async (value) => {
            this.plugin.settings.autoRestartOnRuntimeSwitch = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Runtimes").setHeading();
    containerEl.createEl("p", {
      text: "Configure the CLIs that show up in the sidebar dropdown. Each entry needs a display name and a launch command. Add as many as you want.",
      cls: "setting-item-description"
    });

    const runtimesListEl = containerEl.createDiv({ cls: "claude-cli-runtimes-list" });

    if (this.plugin.settings.runtimes.length === 0) {
      runtimesListEl.createEl("p", {
        text: "No runtimes configured yet. Click 'Add runtime' to create one.",
        cls: "setting-item-description"
      });
    }

    this.plugin.settings.runtimes.forEach((runtime, index) => {
      const setting = new Setting(runtimesListEl).setClass("claude-cli-runtime-item");
      setting.infoEl.detach();
      setting
        .addText((text) =>
          text
            .setPlaceholder("Name")
            .setValue(runtime.name)
            .onChange(async (value) => {
              this.plugin.settings.runtimes[index].name = value;
              await this.plugin.saveSettings();
              this.plugin.notifyRuntimesChanged();
            })
        )
        .addText((text) => {
          text
            .setPlaceholder("Command (e.g. claude, codex --no-alt-screen ...)")
            .setValue(runtime.command)
            .onChange(async (value) => {
              this.plugin.settings.runtimes[index].command = value;
              await this.plugin.saveSettings();
            });
          text.inputEl.addClass("claude-cli-runtime-command-input");
        })
        .addExtraButton((btn) =>
          btn
            .setIcon("trash-2")
            .setTooltip("Remove runtime")
            .onClick(async () => {
              if (this.plugin.settings.runtimes.length <= 1) {
                new Notice("Keep at least one runtime configured.", 4000);
                return;
              }
              const removed = this.plugin.settings.runtimes.splice(index, 1)[0];
              if (this.plugin.settings.selectedRuntimeId === removed.id) {
                this.plugin.settings.selectedRuntimeId = this.plugin.settings.runtimes[0].id;
              }
              await this.plugin.saveSettings();
              this.plugin.notifyRuntimesChanged();
              this.display();
            })
        );
    });

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Add runtime")
        .setIcon("plus")
        .onClick(async () => {
          this.plugin.settings.runtimes.push({
            id: defaultGenerateRuntimeId(),
            name: "New runtime",
            command: ""
          });
          await this.plugin.saveSettings();
          this.plugin.notifyRuntimesChanged();
          this.display();
        })
    );

    new Setting(containerEl).setName("Advanced").setHeading();

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
  const resolvedPluginDir = resolvePluginDir(params.pluginDir, params.vaultPath, path);
  const scriptPath = resolvedPluginDir
    ? path.join(resolvedPluginDir, "pty-proxy.js")
    : path.resolve("pty-proxy.js");

  if (!fs.existsSync(scriptPath)) {
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

  const nodeExecutable = detectNodeExecutable(
    params.nodeExecutable,
    process.platform,
    params.env,
    fs.existsSync,
    path
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
