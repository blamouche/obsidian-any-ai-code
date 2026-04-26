# Any AI CLI

![Any AI CLI](img/banner.png)

Run any local AI coding CLI — Claude, Codex, or your own — inside a right sidebar terminal in Obsidian.

The plugin embeds a real PTY-backed terminal in the sidebar and lets you declare an unlimited list of CLI runtimes from settings (each with a display name and a launch command). Pick one from a dropdown to start it in your active vault folder, switch between them on the fly, and inject the active file or folder as a mention with one click.

## Features

- Dedicated sidebar view with an embedded `xterm` terminal.
- **Customizable runtime list** — declare any number of CLI runtimes from settings (Claude and Codex are pre-populated; add Aider, custom wrappers, anything on `PATH`) and switch between them via a sidebar dropdown.
- One-click `@active file` and `@active folder` buttons that insert the current note path (or its parent folder) as a mention in the running CLI's stdin.
- Process controls in the toolbar: `Start`, `Stop`, `Restart`, `Clear`.
- Launches the selected runtime in the **current active vault folder** so the AI sees your notes as the working tree.
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

If you assemble the plugin folder by hand, make sure these are present:

- `manifest.json`
- `main.js`
- `styles.css`
- `versions.json`
- `pty-proxy.js`
- `pty-bridge.py`
- `package.json` and `package-lock.json` (only needed if you plan to install `node-pty`)

## Usage

1. Click the bot ribbon icon, or run the command palette entry **`Open panel`**, to reveal the panel on the right.
2. Use the runtime dropdown on the first toolbar row to pick which CLI to launch (Claude, Codex, or any custom entry you added).
3. Click `Start` to launch the selected runtime in the active vault folder.
4. While the CLI is running:
   - Click `@active file` or `@active folder` (second toolbar row) to insert the current note path or its parent folder as a mention.
   - Click `Restart` to relaunch, `Stop` to terminate, `Clear` to wipe the terminal output.
5. Switching the dropdown to another runtime while a process is running automatically restarts it on the new CLI (configurable in settings).

## Plugin Settings

General:

- **Default runtime** — which configured runtime is selected when the panel opens (and used by auto-start).
- **Auto-start** — start the default runtime automatically when the panel opens.
- **Auto-restart on runtime switch** — when you change the runtime from the sidebar dropdown while a process is running, restart it immediately to apply the new selection.

Runtimes section (the customizable list of CLIs shown in the sidebar dropdown):

- Each entry holds a display name and a launch command. Examples:
  - `Claude` → `claude`
  - `Codex` → `codex --no-alt-screen -c check_for_update_on_startup=false ...`
  - `Aider` → `aider --model openrouter/...`
- Add as many entries as you need with **Add runtime**. Remove unused ones via the trash icon (the list must keep at least one entry).
- Claude and Codex are pre-populated on first install. Old `command` / `codexCommand` settings from earlier versions are migrated automatically.

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

1. Checks out the repo and runs `npm ci` + `npm run build`.
2. Stages every runtime-required file (`manifest.json`, `main.js`, `styles.css`, `versions.json`, `pty-proxy.js`, `pty-bridge.py`, `package.json`, `package-lock.json`) into an `any-ai-cli/` folder.
3. Zips it as `any-ai-cli-<tag>.zip` for one-click install.
4. Publishes a GitHub Release attaching the zip plus standalone `main.js` / `manifest.json` / `styles.css` (for Obsidian's plugin update protocol and BRAT).
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
