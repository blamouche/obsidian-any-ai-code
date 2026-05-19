import { App, FileSystemAdapter, ItemView, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, WorkspaceLeaf, parseYaml, setIcon } from "obsidian";
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
import {
  buildPromptPreview,
  computeNextRun,
  parseAutomationFile,
  pushHistory,
  type AutomationParseError,
  type AutomationRunRecord,
  type ParsedAutomation
} from "./automation";
import { AutomationsModal } from "./automations-modal";

// Injected at build time by `esbuild.config.mjs` (see `define`). These hold the
// full source of `pty-proxy.js` and `pty-bridge.py` so the plugin can recreate
// them in the plugin folder when Obsidian's community-store auto-install only
// fetched `main.js`, `manifest.json`, and `styles.css`.
declare const PTY_PROXY_SOURCE: string;
declare const PTY_BRIDGE_SOURCE: string;

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
  automationsFolder: string;
  automationsLastRun: Record<string, number>;
  automationsHistory: AutomationRunRecord[];
  automationsHistoryLimit: number;
}

const DEFAULT_SETTINGS: ClaudeCliPluginSettings = {
  runtimes: DEFAULT_RUNTIMES.map((runtime) => ({ ...runtime })),
  selectedRuntimeId: "claude",
  autoRestartOnRuntimeSwitch: true,
  autoStart: true,
  nodeExecutable: "auto",
  automationsFolder: "",
  automationsLastRun: {},
  automationsHistory: [],
  automationsHistoryLimit: 200
};

const AUTOMATION_TICK_MS = 30_000;

const EXAMPLE_AUTOMATION_CONTENT = `---
# ============================================================
# Any AI CLI — automation file. Every available option is shown
# below. The text AFTER the closing "---" is the prompt that gets
# sent to the running CLI.
# ============================================================

# name (string, optional)
# Display name shown in the Automations modal. Defaults to the
# filename (without ".md") when omitted.
name: Hello world

# enabled (true | false, optional, default true)
# When false, the scheduler never auto-fires this automation. It
# still appears in the modal (greyed out) and can be triggered by
# hand with the "Run now" button.
enabled: true

# ----- Schedule: set EXACTLY ONE of "interval" or "cron" -----

# interval (integer minutes, >= 1)
# Fire every N minutes. The first run happens on the next tick
# after the plugin loads; subsequent runs are N minutes apart.
interval: 60

# cron (string, standard 5-field expression)
# Alternative to "interval". To use it: comment out "interval"
# above, then uncomment ONE line below. Fields are:
#   minute hour day-of-month month day-of-week
# cron: "*/30 * * * *"     # every 30 minutes
# cron: "0 9 * * *"        # every day at 09:00
# cron: "0 9 * * 1-5"      # weekdays at 09:00
# cron: "0 */2 * * *"      # every 2 hours, on the hour
# cron: "0 8 1 * *"        # 08:00 on the 1st of each month

# runtime (string, optional)
# Only fire when this runtime is the one currently running, matched
# by its id OR its display name (case-insensitive). Remove the line
# to send to whichever runtime is active. Skipped runs are logged
# in the History tab.
# runtime: Claude

# appendNewline (true | false, optional, default true)
# Append an Enter keystroke after the prompt so the CLI executes it.
# Set false only if you want the text inserted without submitting.
appendNewline: true
---

Say hello and tell me the current date and time.
`;

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
    const mentionBtn = secondaryRowEl.createEl("button", { text: "@active file" });
    const folderMentionBtn = secondaryRowEl.createEl("button", { text: "@active folder" });
    const automationsBtn = secondaryRowEl.createEl("button", { text: "Automations" });
    this.setButtonIcon(mentionBtn, "file-plus", "@active file");
    this.setButtonIcon(folderMentionBtn, "folder-plus", "@active folder");
    this.setButtonIcon(automationsBtn, "calendar-clock", "Automations");
    mentionBtn.addClass("claude-cli-btn-info");
    folderMentionBtn.addClass("claude-cli-btn-info");
    automationsBtn.addClass("claude-cli-btn-info");

    this.statusEl = this.contentEl.createDiv({ cls: "claude-cli-status" });

    startBtn.addEventListener("click", () => this.startClaudeProcess());
    stopBtn.addEventListener("click", () => this.stopClaudeProcess());
    restartBtn.addEventListener("click", () => this.restartClaudeProcess());
    clearBtn.addEventListener("click", () => this.terminal?.clear());
    mentionBtn.addEventListener("click", () => this.insertActiveFileMention());
    folderMentionBtn.addEventListener("click", () => this.insertActiveFolderMention());
    automationsBtn.addEventListener("click", () => {
      new AutomationsModal(this.app, this.plugin).open();
    });
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

  isProcessRunning(): boolean {
    return this.processHandle !== null && this.runningRuntimeId !== null;
  }

  getRunningRuntimeId(): string | null {
    return this.runningRuntimeId;
  }

  matchesRuntime(target: string): boolean {
    if (!this.runningRuntimeId) return false;
    if (this.runningRuntimeId === target) return true;
    const runtime = this.plugin.settings.runtimes.find((r) => r.id === this.runningRuntimeId);
    return runtime ? runtime.name.trim().toLowerCase() === target.trim().toLowerCase() : false;
  }

  sendAutomationPrompt(text: string, submitWithEnter: boolean): void {
    if (!this.processHandle) {
      throw new Error("CLI process is not running");
    }
    this.processHandle.write(text);
    if (submitWithEnter) {
      // Send Enter as a separate write after a short delay. Some TUIs (notably
      // Codex) use bracketed-paste-style heuristics: when text+`\r` arrives in
      // a single write they treat the `\r` as a literal newline inside the
      // input field, not as the submit key. Splitting the writes lets the
      // paste-detection window close, so the `\r` is read as a real Enter.
      const handle = this.processHandle;
      activeWindow.setTimeout(() => {
        try {
          handle.write("\r");
        } catch {
          /* process may have exited between writes */
        }
      }, 120);
    }
    this.writeSystemLine(`[Automation prompt injected]`);
  }

  refreshRuntimeSelect(): void {
    if (!this.runtimeSelect) {
      return;
    }
    this.runtimeSelect.empty();
    const runtimes = this.plugin.settings.runtimes;
    if (runtimes.length === 0) {
      const placeholder = this.runtimeSelect.createEl("option", { text: "No runtime configured" });
      placeholder.value = "";
      this.runtimeSelect.value = "";
      this.runtimeSelect.disabled = true;
      return;
    }
    this.runtimeSelect.disabled = false;
    for (const runtime of runtimes) {
      const opt = this.runtimeSelect.createEl("option", { text: runtime.name || "(Unnamed)" });
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

    const targetLabel = targetRuntime.name || "(Unnamed runtime)";

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
      return match?.name || "(Unnamed runtime)";
    }
    return this.getSelectedRuntime()?.name || "(No runtime)";
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
  private automationEntries: Map<string, ParsedAutomation> = new Map();
  private automationErrors: Map<string, AutomationParseError> = new Map();
  private automationListeners: Set<() => void> = new Set();

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_CLAUDE, (leaf) => new ClaudeCliView(leaf, this));

    this.addRibbonIcon("bot", "Open AI CLI panel", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-panel",
      name: "Open panel",
      callback: () => {
        void this.activateView();
      }
    });

    this.addSettingTab(new ClaudeCliSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.loadAutomations();
      this.runAutomationTick();
    });

    const refreshOnVaultChange = (file: { path: string } | null) => {
      const folder = this.settings.automationsFolder;
      if (!folder || !file) return;
      if (file.path === folder || file.path.startsWith(`${folder}/`)) {
        this.loadAutomations();
      }
    };

    this.registerEvent(this.app.vault.on("create", refreshOnVaultChange));
    this.registerEvent(this.app.vault.on("modify", refreshOnVaultChange));
    this.registerEvent(this.app.vault.on("delete", refreshOnVaultChange));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        refreshOnVaultChange(file);
        const folder = this.settings.automationsFolder;
        if (folder && (oldPath === folder || oldPath.startsWith(`${folder}/`))) {
          this.loadAutomations();
        }
      })
    );

    this.registerInterval(activeWindow.setInterval(() => this.runAutomationTick(), AUTOMATION_TICK_MS));
  }

  onunload(): void {
    // Per Obsidian plugin guidelines, do not detach leaves on unload —
    // Obsidian preserves leaf state across reloads/updates.
  }

  getAutomations(): ParsedAutomation[] {
    return Array.from(this.automationEntries.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  getAutomationErrors(): AutomationParseError[] {
    return Array.from(this.automationErrors.values());
  }

  onAutomationsChanged(listener: () => void): () => void {
    this.automationListeners.add(listener);
    return () => this.automationListeners.delete(listener);
  }

  private notifyAutomationsChanged(): void {
    this.automationListeners.forEach((listener) => {
      try {
        listener();
      } catch {
        /* ignore listener errors */
      }
    });
  }

  loadAutomations(): void {
    this.automationEntries.clear();
    this.automationErrors.clear();
    const folderPath = this.settings.automationsFolder.trim();
    if (!folderPath) {
      this.notifyAutomationsChanged();
      return;
    }
    const folder = this.app.vault.getFolderByPath(folderPath);
    if (!folder) {
      this.notifyAutomationsChanged();
      return;
    }
    const files: TFile[] = [];
    const walk = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFile && child.extension === "md") {
          files.push(child);
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };
    walk(folder);

    void Promise.all(
      files.map(async (file) => {
        try {
          const content = await this.app.vault.cachedRead(file);
          const result = parseAutomationFile(content, file.path, (yaml) => parseYaml(yaml));
          if (result.ok) {
            this.automationEntries.set(file.path, result.entry);
          } else {
            this.automationErrors.set(file.path, result.error);
          }
        } catch (err) {
          this.automationErrors.set(file.path, {
            path: file.path,
            name: file.basename,
            reason: `Read error: ${(err as Error).message}`
          });
        }
      })
    ).then(() => {
      this.notifyAutomationsChanged();
    });
  }

  runAutomationTick(): void {
    if (this.automationEntries.size === 0) return;
    const now = Date.now();
    for (const entry of this.automationEntries.values()) {
      if (!entry.enabled) continue;
      const last = this.settings.automationsLastRun[entry.path] ?? null;
      const next = computeNextRun(entry, last, now);
      if (next !== null && next <= now) {
        void this.triggerAutomation(entry, "scheduler");
      }
    }
  }

  async triggerAutomation(
    entry: ParsedAutomation,
    source: "scheduler" | "manual"
  ): Promise<void> {
    const now = Date.now();
    const baseRecord = {
      ts: now,
      path: entry.path,
      name: entry.name,
      source
    } as const;

    const view = this.findRunnableView();
    if (!view) {
      const reason = "No CLI is running";
      this.recordHistory({ ...baseRecord, status: "skipped", reason });
      if (source === "manual") {
        new Notice(`Automation "${entry.name}" skipped — ${reason.toLowerCase()}.`, 5000);
      }
      return;
    }

    if (entry.runtime) {
      const runtimeMatches = view.matchesRuntime(entry.runtime);
      if (!runtimeMatches) {
        const reason = `Runtime mismatch (expected "${entry.runtime}")`;
        this.recordHistory({ ...baseRecord, status: "skipped", reason });
        if (source === "manual") {
          new Notice(`Automation "${entry.name}" skipped — ${reason.toLowerCase()}.`, 5000);
        }
        return;
      }
    }

    try {
      view.sendAutomationPrompt(entry.body, entry.appendNewline);
      const runtimeId = view.getRunningRuntimeId();
      this.recordHistory({
        ...baseRecord,
        status: "ran",
        runtimeId,
        promptPreview: buildPromptPreview(entry.body)
      });
      this.settings.automationsLastRun[entry.path] = now;
      await this.saveSettings();
      if (source === "manual") {
        new Notice(`Automation "${entry.name}" sent.`, 3000);
      }
    } catch (err) {
      this.recordHistory({
        ...baseRecord,
        status: "error",
        reason: (err as Error).message
      });
      new Notice(`Automation "${entry.name}" failed: ${(err as Error).message}`, 6000);
    }
  }

  private findRunnableView(): ClaudeCliView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof ClaudeCliView && view.isProcessRunning()) {
        return view;
      }
    }
    return null;
  }

  recordHistory(record: AutomationRunRecord): void {
    this.settings.automationsHistory = pushHistory(
      this.settings.automationsHistory,
      record,
      this.settings.automationsHistoryLimit
    );
    void this.saveSettings();
    this.notifyAutomationsChanged();
  }

  clearAutomationHistory(): void {
    this.settings.automationsHistory = [];
    void this.saveSettings();
    this.notifyAutomationsChanged();
  }

  async createExampleAutomation(): Promise<TFile> {
    const folder = this.settings.automationsFolder.trim().replace(/\/+$/, "");
    if (!folder) {
      throw new Error("Set an automations folder first.");
    }
    if (!this.app.vault.getFolderByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }

    let target = `${folder}/hello-world.md`;
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(target)) {
      target = `${folder}/hello-world-${counter}.md`;
      counter += 1;
    }

    const file = await this.app.vault.create(target, EXAMPLE_AUTOMATION_CONTENT);
    this.loadAutomations();
    return file;
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

    await workspace.revealLeaf(leaf);
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
          : DEFAULT_SETTINGS.nodeExecutable,
      automationsFolder:
        typeof raw.automationsFolder === "string" ? raw.automationsFolder : DEFAULT_SETTINGS.automationsFolder,
      automationsLastRun: sanitizeLastRun(raw.automationsLastRun),
      automationsHistory: sanitizeHistory(raw.automationsHistory),
      automationsHistoryLimit:
        typeof raw.automationsHistoryLimit === "number" &&
        Number.isInteger(raw.automationsHistoryLimit) &&
        raw.automationsHistoryLimit > 0
          ? raw.automationsHistoryLimit
          : DEFAULT_SETTINGS.automationsHistoryLimit
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
          dropdown.addOption("", "No runtime configured");
          dropdown.setDisabled(true);
        } else {
          for (const runtime of runtimes) {
            dropdown.addOption(runtime.id, runtime.name || "(Unnamed)");
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
      text: "Configure the runtimes that show up in the sidebar dropdown. Each entry needs a display name and a launch command. Add as many as you want.",
      cls: "setting-item-description"
    });

    const runtimesListEl = containerEl.createDiv({ cls: "claude-cli-runtimes-list" });

    if (this.plugin.settings.runtimes.length === 0) {
      runtimesListEl.createEl("p", {
        text: "No runtimes configured yet. Use the button below to create one.",
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
            .setPlaceholder("Launch command")
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

    new Setting(containerEl).setName("Automations").setHeading();
    containerEl.createEl("p", {
      text: "Folder containing prompt automations. Each Markdown file is one automation (frontmatter sets the schedule; body is the prompt sent to the running CLI). See readme for the file format.",
      cls: "setting-item-description"
    });

    new Setting(containerEl)
      .setName("Automations folder")
      .setDesc("Vault-relative path. Leave empty to disable automations.")
      .addText((text) =>
        text
          .setPlaceholder("Automations")
          .setValue(this.plugin.settings.automationsFolder)
          .onChange(async (value) => {
            this.plugin.settings.automationsFolder = value.trim();
            await this.plugin.saveSettings();
            this.plugin.loadAutomations();
          })
      );

    new Setting(containerEl)
      .setName("Reload automations")
      .setDesc("Force a re-scan of the automations folder (otherwise scans happen on vault changes).")
      .addButton((btn) =>
        btn
          .setButtonText("Reload now")
          .setIcon("refresh-cw")
          .onClick(() => {
            this.plugin.loadAutomations();
            new Notice("Automations reloaded.", 2500);
          })
      );

    new Setting(containerEl)
      .setName("Create example automation")
      .setDesc("Write a documented hello-world automation file (all fields explained) into the folder above.")
      .addButton((btn) =>
        btn
          .setButtonText("Create example")
          .setIcon("file-plus")
          .onClick(async () => {
            try {
              const file = await this.plugin.createExampleAutomation();
              new Notice(`Created ${file.path}`, 3000);
              await this.app.workspace.openLinkText(file.path, "", true);
            } catch (err) {
              new Notice((err as Error).message, 5000);
            }
          })
      );

    new Setting(containerEl).setName("Advanced").setHeading();

    new Setting(containerEl)
      .setName("Node executable")
      .setDesc("Path to the node binary used by the proxy. Leave as 'auto' for automatic detection.")
      .addText((text) =>
        text
          .setPlaceholder("Auto")
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

function writeProxyFileIfNeeded(targetPath: string, source: string): void {
  try {
    if (fs.existsSync(targetPath) && fs.readFileSync(targetPath, "utf8") === source) {
      return;
    }
  } catch {
    // fall through and rewrite — we'd rather overwrite than silently fail
  }
  fs.writeFileSync(targetPath, source);
}

function ensureProxyFiles(pluginDir: string): void {
  writeProxyFileIfNeeded(path.join(pluginDir, "pty-proxy.js"), PTY_PROXY_SOURCE);
  writeProxyFileIfNeeded(path.join(pluginDir, "pty-bridge.py"), PTY_BRIDGE_SOURCE);
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
  if (resolvedPluginDir) {
    // Recreate the auxiliary files from the embedded build-time constants if
    // Obsidian's community-store auto-install did not ship them, or if a previous
    // version's content is stale.
    ensureProxyFiles(resolvedPluginDir);
  }

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

function sanitizeLastRun(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === "string" && key && typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeHistory(raw: unknown): AutomationRunRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: AutomationRunRecord[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Partial<AutomationRunRecord>;
    if (
      typeof r.ts !== "number" ||
      typeof r.path !== "string" ||
      typeof r.name !== "string" ||
      (r.source !== "scheduler" && r.source !== "manual") ||
      (r.status !== "ran" && r.status !== "skipped" && r.status !== "error")
    ) {
      continue;
    }
    out.push({
      ts: r.ts,
      path: r.path,
      name: r.name,
      source: r.source,
      status: r.status,
      reason: typeof r.reason === "string" ? r.reason : undefined,
      runtimeId: typeof r.runtimeId === "string" ? r.runtimeId : null,
      promptPreview: typeof r.promptPreview === "string" ? r.promptPreview : undefined
    });
  }
  return out;
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
