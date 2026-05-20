# Any AI CLI

![Any AI CLI](img/banner.png)

Run any local AI coding CLI — Claude, Codex, or your own — inside a right sidebar terminal in Obsidian.

The plugin embeds a real PTY-backed terminal in the sidebar and lets you declare an unlimited list of CLI runtimes from settings (each with a display name and a launch command). Open as many sessions as you like — each runs in its own tab with its own process, so several runtimes (or several instances of the same one) run in parallel in a single panel. Launch sessions in your active vault folder, switch tabs on the fly, and inject the active file or folder as a mention with one click. You can also schedule reusable prompts: drop markdown files in a vault folder and the plugin fires each one into its own fresh session tab on an interval or cron — or run them on demand from the Automations panel, with a per-run history you can export.

## Features

- Dedicated sidebar view with an embedded `xterm` terminal.
- **Parallel sessions in tabs** — run multiple runtimes (or multiple instances of the same one) side by side, each in its own tab with its own process. Switch tabs to bring a session to the front; background sessions keep running. A `+` control opens a new session from any configured runtime.
- **Customizable runtime list** — declare any number of CLI runtimes from settings (Claude and Codex are pre-populated; add Aider, custom wrappers, anything on `PATH`).
- One-click `@active file` and `@active folder` buttons that insert the current note path (or its parent folder) as a mention in the active session's stdin.
- **Automations** — drop markdown files (prompt + frontmatter schedule) in a vault folder and have each fired into its own new session tab on an `interval` or `cron`, or run them manually from a modal with a per-run history log.
- Process controls in the toolbar act on the active tab: `New session`, `Stop`, `Restart`, `Clear`.
- Launches each session in the **current active vault folder** so the AI sees your notes as the working tree.
- Resilient PTY stack with multi-tier fallbacks (`node-pty` → Python PTY bridge → direct pipe → `script`) so it works on macOS, Linux, and Windows.
- Visible runtime status (`Status: ...`) and clear error reporting in the panel.

## Requirements

- Obsidian Desktop 1.7.2 or newer (`isDesktopOnly` plugin).
- Node.js available on the machine.
- At least one AI coding CLI installed on `PATH` (e.g. `claude`, `codex`, `aider`).
- For the Python PTY fallback on macOS/Linux: `python3` recommended.

## Install in a Vault

### Recommended — from a GitHub release

1. Open the [latest release](https://github.com/blamouche/obsidian-any-ai-code/releases/latest).
2. Download `any-ai-cli-<version>.zip`.
3. Unzip it directly inside your vault's plugin folder so the resulting path is:

   ```
   /PATH/TO/VAULT/.obsidian/plugins/any-ai-cli/
   ```

4. In Obsidian, enable the plugin: `Settings → Community plugins → Installed plugins → Any AI CLI`.

That's it. No commands required — the plugin uses an embedded Python PTY bridge fallback so it works out of the box on macOS / Linux (and falls back to direct pipe mode on Windows).

### Optional — install the native PTY backend for best terminal fidelity

The bundle ships without `node-pty` (a native module that has to be compiled for your specific Node ABI). The plugin works without it, but installing it gives you a fully native PTY (better full-screen TUI rendering and resize behavior). To enable it:

```bash
cd "/PATH/TO/VAULT/.obsidian/plugins/any-ai-cli"
npm install --omit=dev
```

Reload the plugin afterwards.

### Manual install / dev clone

1. Clone or copy the repository into `/PATH/TO/VAULT/.obsidian/plugins/any-ai-cli/`.
2. Run `npm install` and `npm run build` inside the folder to produce `main.js`.
3. Enable the plugin in `Settings → Community plugins`.

### Required files

The community-store auto-install and the release zip both ship only the three canonical Obsidian plugin files. Everything else the plugin needs at runtime is bootstrapped from `main.js`:

**In the release zip / plugin folder:**

- `manifest.json` — Obsidian plugin metadata (id, version, minAppVersion).
- `main.js` — bundled plugin code. Embeds the full source of `pty-proxy.js` and `pty-bridge.py` (injected by esbuild's `define` at build time) and writes them next to itself on first `Start`.
- `styles.css` — sidebar / toolbar / dropdown styling. Without it the panel renders with raw browser defaults.

**Auto-generated on first run (from `main.js`):**

- `pty-proxy.js` — Node child process that runs your CLI inside a PTY.
- `pty-bridge.py` — Python PTY fallback used on macOS/Linux when `node-pty` is not installed.

**Available on the GitHub release page but not in the zip:**

- `versions.json` — used by Obsidian to find a backwards-compatible plugin version when the current `minAppVersion` is too high for the user's app. Obsidian fetches it directly from the release URL.

**Not shipped with the plugin (only in the repo, for advanced users):**

- `package.json` + `package-lock.json` — needed only if you opt into the native `node-pty` backend. Download them from the repo for the matching tag, drop them in the plugin folder, and run `npm install --omit=dev`.

## Usage

1. Click the bot ribbon icon, or run the command palette entry **`Open panel`**, to reveal the panel on the right.
2. Click `New session` (or the `+` at the end of the tab bar) and pick a runtime to launch it in the active vault folder. With auto-start enabled, the default runtime opens automatically as the first session.
3. Open more sessions the same way — each gets its own tab and process, so runtimes run in parallel. Tabs of the same runtime are disambiguated (`Claude`, `Claude (2)`, …).
4. Click a tab to bring its session to the front; the `×` on a tab closes that session (and kills its process). Each tab has a status dot reflecting activity: **green** = the AI is working, **purple** = an automation's AI is working, **gray** = the CLI is idle (finished its turn) or stopped.
5. The toolbar acts on the active tab:
   - Click `@active file` or `@active folder` (second toolbar row) to insert the current note path or its parent folder as a mention.
   - Click `Restart` to relaunch the active session's runtime in place, `Stop` to terminate it, `Clear` to wipe its terminal output.
6. Click `Automations` (second toolbar row) to open the Automations modal: run any prompt manually with **Run now**, or browse the **History** tab to see what fired and when.

## Automations

Automations let you store reusable prompts as markdown files in your vault. When an automation fires (on a schedule or manually), the plugin opens a **new session tab** for the target runtime and sends the prompt to it — so scheduled runs execute in parallel without disturbing your other sessions.

### Setup

1. Pick a folder in your vault to hold the prompts (e.g. `Automations`).
2. In plugin settings → **Automations folder**, set that path. Leave empty to disable the feature.
3. Drop one markdown file per automation in that folder. The plugin scans the folder on startup and live-updates on vault changes (create / modify / delete / rename).

> Tip: in plugin settings, click **Create example** to drop a fully documented `hello-world.md` (every field explained) into the configured folder — the fastest way to see the format.

### File format

Each automation is a regular markdown file with YAML frontmatter that sets the schedule, plus a body containing the prompt that will be sent to the CLI verbatim.

```markdown
---
name: Daily summary           # optional, defaults to the filename
enabled: true                 # optional, defaults to true
interval: 60                  # minutes — exclusive with `cron`
# cron: "0 9 * * 1-5"         # standard 5-field cron — exclusive with `interval`
runtime: claude               # optional — runtime id or display name to spawn; omit to use the default runtime
appendNewline: true           # optional, defaults to true (adds Enter so the CLI executes the prompt)
---

Summarize my notes from the last 24h and propose three priorities for today.
```

Rules:

- Exactly one of `interval` or `cron` must be set. `interval` is in whole minutes (>= 1). `cron` uses standard 5-field syntax (`cron-parser`).
- `enabled: false` keeps the entry visible in the modal but skips scheduling (you can still trigger it with **Run now**).
- The prompt is everything after the closing `---` (trimmed).
- The `runtime` field selects which runtime to spawn, matched by id or display name. If it names a runtime that is not configured, the run is skipped and logged in History.
- If `runtime` is omitted, the automation spawns the **default runtime** (set in plugin settings).
- Each run opens its own session tab. With **Auto-close automation sessions on exit** enabled (default), the tab closes when the process exits; enable **Auto-close automation sessions when idle** to also close it once the AI goes quiet (for CLIs that stay interactive instead of exiting).

### Manual runs and history

The **Automations** toolbar button opens a modal with two tabs:

- **Automations** — list of parsed entries with schedule, last run, next run, status badge, and a **Run now** button per row (always enabled — it opens a new session tab and sends the prompt). Parse errors are shown at the top with file paths and reasons.
- **History** — chronological log of every fired run (or skip / error), capped at 200 entries by default. You can **Clear history** or **Export as markdown** to create a snapshot note in the vault.

## Plugin Settings

General:

- **Default runtime** — which configured runtime opens as the first session on auto-start, and which automations use when they declare no `runtime`.
- **Auto-start** — open the default runtime as a session automatically when the panel opens.
- **Auto-close automation sessions on exit** — when an automation-spawned session's process exits, close its tab automatically so tabs don't pile up (default on).
- **Auto-close automation sessions when idle** — close an automation tab once its CLI goes quiet for ~10s after the prompt ran (the AI finished its turn), even if the process stays alive (default off). Useful for CLIs like Claude/Codex that stay interactive instead of exiting. A long task that pauses output for over 10s could be closed early, so it's opt-in.
- **Max concurrent sessions** — cap the number of session tabs that can run at once (`0` = unlimited). Protects against runaway automation spawns.

Runtimes section (the customizable list of CLIs available from the new-session menu):

- Each entry holds a display name and a launch command. Examples:
  - `Claude` → `claude`
  - `Codex` → `codex --no-alt-screen -c check_for_update_on_startup=false ...`
  - `Aider` → `aider --model openrouter/...`
- Add as many entries as you need with **Add runtime**. Remove unused ones via the trash icon (the list must keep at least one entry).
- Claude and Codex are pre-populated on first install. Old `command` / `codexCommand` settings from earlier versions are migrated automatically.

Automations section:

- **Automations folder** — vault-relative path to the folder holding automation markdown files. Leave empty to disable. See the [Automations](#automations) section above for the file format.
- **Reload automations** — force a re-scan (otherwise the plugin already refreshes on any vault change inside the folder).
- **Create example automation** — write a documented `hello-world.md` (all fields explained) into the configured folder and open it.

Advanced:

- **Node executable** — path to the Node binary used to run the PTY proxy. Leave as `auto` for automatic detection, or override with an explicit path (`/opt/homebrew/bin/node`, `C:\Program Files\nodejs\node.exe`, etc.).

## Runtime Architecture (Fallback Chain)

The plugin tries multiple strategies to maximize startup success:

1. PTY via `node-pty`
2. Python PTY bridge fallback (`pty-bridge.py`) on macOS/Linux
3. Direct pipe fallback (`child_process`)
4. `script` fallback (last resort on Unix)

Status and logs clearly show the active strategy (`proxy-warn`, `proxy-info`, etc.).

## Troubleshooting

### `command not found: <cli>`

The CLI binary is not in Obsidian's process `PATH`. Either:

- Edit the runtime entry in settings and set the **Launch command** to an absolute path, for example `/Users/<you>/.local/bin/claude` or `/opt/homebrew/bin/codex`.
- Or adjust your shell/Obsidian environment so the CLI resolves on `PATH`.

### `Cannot find module 'node-pty'`

Since 0.1.25, this no longer crashes the plugin — `node-pty` is optional and the proxy automatically falls back to the Python bridge (or direct pipe). If you want the native PTY backend anyway:

```bash
cd "/PATH/TO/VAULT/.obsidian/plugins/any-ai-cli"
npm install --omit=dev
```

### `posix_spawnp failed`

Native PTY failed in the current runtime environment.

- Plugin should automatically fallback to Python/pipe mode.
- Ensure `python3` is installed for Python PTY fallback.

### Empty panel

- Ensure `main.js` **and** `styles.css` are up to date
- Reload plugin (disable/enable)
- Open Obsidian developer console if needed

## Local Development

```bash
npm install
npm run lint
npm run test
npm run build
```

- `npm run dev`: esbuild watch mode
- `npm run build`: compile `main.ts` -> `main.js`
- `npm run lint`: run [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin) so violations of the Obsidian community-store guidelines are caught locally before submission

## Test Stack

- Framework: Vitest
- Tests: `tests/**/*.test.ts`
- Commands:
  - `npm run test`
  - `npm run test:watch`

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`

Triggers:

- `push`
- `pull_request`

Steps:

1. `npm ci`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

## Release

GitHub Actions workflow: `.github/workflows/release.yml`

Triggered by pushing a git tag (e.g. `0.1.25`):

```bash
git tag 0.1.25
git push origin 0.1.25
```

The workflow:

1. Checks out the repo and runs `npm ci` + `npm run build`. At build time, `esbuild` inlines `pty-proxy.js` and `pty-bridge.py` into `main.js` (via `define`) so they no longer need to ship as separate files.
2. Stages the three canonical Obsidian plugin files (`manifest.json`, `main.js`, `styles.css`) into an `any-ai-cli/` folder.
3. Zips it as `any-ai-cli-<tag>.zip` for drop-in install.
4. Publishes a GitHub Release as a draft, attaching the zip plus standalone `manifest.json`, `main.js`, `styles.css`, and `versions.json` (the assets Obsidian's plugin update protocol and tools like BRAT actually fetch).
5. Auto-generates release notes from the commit history.

Before tagging, keep these versions in sync: `manifest.json`, `versions.json`, `package.json`.

## Main Files

- `main.ts`: Obsidian plugin logic
- `main.js`: built distribution file
- `styles.css`: terminal panel styling
- `manifest.json`: Obsidian plugin metadata
- `pty-proxy.js`: runtime proxy (Node)
- `pty-bridge.py`: Python PTY fallback
- `runtime-utils.ts`: testable shared utilities
- `tests/runtime-utils.test.ts`: unit tests

## Platform Notes

- macOS/Linux: full support with Python PTY fallback
- Windows: support via `node-pty` or pipe fallback
- Obsidian Mobile: not supported (`isDesktopOnly`)

## License

MIT
