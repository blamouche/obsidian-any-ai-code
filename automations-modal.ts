import { App, Modal, Notice, setIcon } from "obsidian";
import type ClaudeCliPlugin from "./main";
import {
  computeNextRun,
  describeSchedule,
  type AutomationRunRecord,
  type ParsedAutomation
} from "./automation";

type Tab = "automations" | "history";

export class AutomationsModal extends Modal {
  private plugin: ClaudeCliPlugin;
  private currentTab: Tab = "automations";
  private tabsHostEl: HTMLDivElement | null = null;
  private bodyEl: HTMLDivElement | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(app: App, plugin: ClaudeCliPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.modalEl.addClass("any-ai-cli-automations-modal");
    this.titleEl.setText("Automations");
    this.contentEl.empty();

    this.tabsHostEl = this.contentEl.createDiv({ cls: "any-ai-cli-am-tabs" });
    this.bodyEl = this.contentEl.createDiv({ cls: "any-ai-cli-am-body" });

    this.renderTabs();
    this.renderBody();

    this.unsubscribe = this.plugin.onAutomationsChanged(() => {
      this.renderBody();
    });
  }

  onClose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.contentEl.empty();
  }

  private renderTabs(): void {
    if (!this.tabsHostEl) return;
    this.tabsHostEl.empty();
    const tabs: { id: Tab; label: string }[] = [
      { id: "automations", label: "Automations" },
      { id: "history", label: "History" }
    ];
    for (const tab of tabs) {
      const btn = this.tabsHostEl.createEl("button", {
        text: tab.label,
        cls: `any-ai-cli-am-tab${this.currentTab === tab.id ? " is-active" : ""}`
      });
      btn.addEventListener("click", () => {
        if (this.currentTab !== tab.id) {
          this.currentTab = tab.id;
          this.renderTabs();
          this.renderBody();
        }
      });
    }
  }

  private renderBody(): void {
    if (!this.bodyEl) return;
    this.bodyEl.empty();
    if (this.currentTab === "automations") {
      this.renderAutomationsTab(this.bodyEl);
    } else {
      this.renderHistoryTab(this.bodyEl);
    }
  }

  private renderAutomationsTab(host: HTMLDivElement): void {
    const folder = this.plugin.settings.automationsFolder.trim();
    if (!folder) {
      host.createEl("p", {
        text: "No automations folder configured. Set one in plugin settings to get started.",
        cls: "any-ai-cli-am-empty"
      });
      return;
    }

    const entries = this.plugin.getAutomations();
    const errors = this.plugin.getAutomationErrors();
    const enabledCount = entries.filter((e) => e.enabled).length;
    const disabledCount = entries.length - enabledCount;

    const info = host.createEl("p", { cls: "any-ai-cli-am-info" });
    info.setText(
      `${entries.length} automation${entries.length === 1 ? "" : "s"} (${enabledCount} enabled, ${disabledCount} disabled) — folder: ${folder}`
    );

    if (errors.length > 0) {
      const errBox = host.createDiv({ cls: "any-ai-cli-am-errors" });
      errBox.createEl("strong", { text: `${errors.length} file${errors.length === 1 ? "" : "s"} could not be parsed:` });
      const list = errBox.createEl("ul");
      for (const err of errors) {
        const item = list.createEl("li");
        item.createSpan({ text: err.path, cls: "any-ai-cli-am-error-path" });
        item.createSpan({ text: ` — ${err.reason}` });
      }
    }

    if (entries.length === 0) {
      host.createEl("p", {
        text: "No automations found in the configured folder.",
        cls: "any-ai-cli-am-empty"
      });
      return;
    }

    const runnable = this.isAnyViewRunning();

    const table = host.createEl("table", { cls: "any-ai-cli-am-table" });
    const thead = table.createEl("thead").createEl("tr");
    for (const label of ["Name", "Schedule", "Last run", "Next run", "Status", "Actions"]) {
      thead.createEl("th", { text: label });
    }
    const tbody = table.createEl("tbody");

    const now = Date.now();
    for (const entry of entries) {
      const tr = tbody.createEl("tr");
      if (!entry.enabled) tr.addClass("is-disabled");

      tr.createEl("td", { text: entry.name });
      tr.createEl("td", { text: describeSchedule(entry) });

      const lastRun = this.plugin.settings.automationsLastRun[entry.path] ?? null;
      tr.createEl("td", { text: lastRun ? formatRelative(lastRun, now) : "never" });

      const nextRun = entry.enabled ? computeNextRun(entry, lastRun, now) : null;
      tr.createEl("td", {
        text: nextRun === null ? "—" : nextRun <= now ? "due now" : formatRelative(nextRun, now)
      });

      const statusCell = tr.createEl("td");
      const badge = statusCell.createSpan({
        text: entry.enabled ? "enabled" : "disabled",
        cls: `any-ai-cli-am-badge ${entry.enabled ? "is-enabled" : "is-disabled"}`
      });
      if (entry.runtime) {
        badge.setAttribute("title", `Requires runtime "${entry.runtime}"`);
      }

      const actionsCell = tr.createEl("td", { cls: "any-ai-cli-am-actions" });
      const runBtn = actionsCell.createEl("button", { text: "Run now" });
      runBtn.disabled = !runnable;
      if (!runnable) {
        runBtn.setAttribute("title", "Start a CLI in the sidebar panel first.");
      }
      runBtn.addEventListener("click", () => {
        void this.plugin.triggerAutomation(entry, "manual");
      });

      const openBtn = actionsCell.createEl("button", { text: "Open" });
      setIcon(openBtn.createSpan(), "external-link");
      openBtn.addEventListener("click", () => {
        void this.app.workspace.openLinkText(entry.path, "", true);
        this.close();
      });
    }
  }

  private renderHistoryTab(host: HTMLDivElement): void {
    const history = this.plugin.settings.automationsHistory;

    const toolbar = host.createDiv({ cls: "any-ai-cli-am-history-toolbar" });
    toolbar.createEl("p", {
      text: `${history.length} entr${history.length === 1 ? "y" : "ies"} (most recent first, capped at ${this.plugin.settings.automationsHistoryLimit}).`,
      cls: "any-ai-cli-am-info"
    });

    const actions = toolbar.createDiv({ cls: "any-ai-cli-am-history-actions" });

    const clearBtn = actions.createEl("button", { text: "Clear history" });
    clearBtn.disabled = history.length === 0;
    clearBtn.addEventListener("click", () => {
      this.plugin.clearAutomationHistory();
      new Notice("Automation history cleared.", 2500);
    });

    const exportBtn = actions.createEl("button", { text: "Export as markdown" });
    exportBtn.disabled = history.length === 0;
    exportBtn.addEventListener("click", () => {
      void this.exportHistory(history);
    });

    if (history.length === 0) {
      host.createEl("p", { text: "No runs recorded yet.", cls: "any-ai-cli-am-empty" });
      return;
    }

    const list = host.createEl("ul", { cls: "any-ai-cli-am-history-list" });
    for (const record of history) {
      const li = list.createEl("li", { cls: "any-ai-cli-am-history-item" });
      li.createSpan({ text: formatDateTime(record.ts), cls: "any-ai-cli-am-history-ts" });
      li.createSpan({ text: record.name, cls: "any-ai-cli-am-history-name" });
      li.createSpan({
        text: record.status,
        cls: `any-ai-cli-am-badge is-${record.status}`
      });
      li.createSpan({ text: record.source, cls: "any-ai-cli-am-history-source" });
      const detail = record.reason || record.promptPreview || "";
      if (detail) {
        li.createSpan({ text: detail, cls: "any-ai-cli-am-history-detail" });
      }
    }
  }

  private isAnyViewRunning(): boolean {
    const leaves = this.app.workspace.getLeavesOfType("claude-cli-view");
    return leaves.some((leaf) => {
      const view = leaf.view as unknown as { isProcessRunning?: () => boolean };
      return typeof view?.isProcessRunning === "function" && view.isProcessRunning();
    });
  }

  private async exportHistory(history: AutomationRunRecord[]): Promise<void> {
    const lines: string[] = [];
    lines.push(`# Automations history — ${new Date().toISOString()}`, "");
    lines.push("| Time | Name | Status | Source | Detail | Path |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const r of history) {
      const detail = (r.reason || r.promptPreview || "").replace(/\|/g, "\\|");
      lines.push(
        `| ${formatDateTime(r.ts)} | ${r.name.replace(/\|/g, "\\|")} | ${r.status} | ${r.source} | ${detail} | ${r.path} |`
      );
    }
    const fileName = `automations-history-${new Date().toISOString().slice(0, 10)}.md`;
    try {
      const file = await this.app.vault.create(fileName, lines.join("\n"));
      await this.app.workspace.openLinkText(file.path, "", true);
      this.close();
    } catch (err) {
      new Notice(`Export failed: ${(err as Error).message}`, 5000);
    }
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatRelative(ts: number, now: number): string {
  const diff = ts - now;
  const absMs = Math.abs(diff);
  const sec = Math.round(absMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  const arrow = diff < 0 ? "ago" : "in";
  let value: string;
  if (sec < 60) value = `${sec}s`;
  else if (min < 60) value = `${min}m`;
  else if (hr < 24) value = `${hr}h`;
  else value = `${day}d`;
  return diff < 0 ? `${value} ${arrow}` : `${arrow} ${value}`;
}
