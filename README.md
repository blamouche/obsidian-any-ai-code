# Obsidian Any AI Code

Obsidian desktop plugin that opens your **local Claude Code CLI** in a right sidebar panel.

## Goal

Use Claude Code directly inside your active Obsidian vault without leaving Obsidian.

## Features

- Dedicated `Claude Code` view in the right sidebar
- Embedded terminal (xterm)
- Quick actions: `Start`, `Stop`, `Restart`, `Clear`
- Launches Claude in the **current active vault folder**
- Visible UI status (`Status: ...`)
- Explicit runtime error messages in the panel
- Runtime fallbacks for macOS / Linux / Windows

## Requirements

- Obsidian Desktop (`isDesktopOnly` plugin)
- Node.js installed on the machine
- Claude Code CLI installed (`claude` available)
- For advanced macOS/Linux fallback: `python3` recommended

## Install in a Vault

1. Create the plugin folder:

```bash
mkdir -p "/PATH/TO/VAULT/.obsidian/plugins/obsidian-any-ai-code"
```

2. Copy the repository content into this folder (or use a symlink).

3. In that plugin folder, install runtime dependencies:

```bash
npm install --omit=dev
```

4. Verify at least these files exist:

- `manifest.json`
- `main.js`
- `styles.css`
- `versions.json`
- `pty-proxy.js`
- `pty-bridge.py`
- `node_modules/node-pty/...`

5. Enable the plugin in Obsidian:

- `Settings -> Community plugins`

## Usage

- Click the terminal ribbon icon, or run command:
  - `Open Claude Code panel`
- The panel opens on the right.
- Click `Start` to launch Claude.

## Plugin Settings

- `Command`: command to run (default: `claude`)
- `Auto-start`: starts automatically when panel opens
- `Node executable`:
  - `auto` (recommended): automatic detection
  - or explicit path (`/opt/homebrew/bin/node`, `C:\Program Files\nodejs\node.exe`, etc.)

## Runtime Architecture (Fallback Chain)

The plugin tries multiple strategies to maximize startup success:

1. PTY via `node-pty`
2. Python PTY bridge fallback (`pty-bridge.py`) on macOS/Linux
3. Direct pipe fallback (`child_process`)
4. `script` fallback (last resort on Unix)

Status and logs clearly show the active strategy (`proxy-warn`, `proxy-info`, etc.).

## Troubleshooting

### `command not found: claude`

Claude binary is not in Obsidian process `PATH`.

- Set `Command` to an absolute path, for example:
  - `/Users/<you>/.local/bin/claude`
- Or adjust your shell/Obsidian environment.

### `Cannot find module 'node-pty'`

`node-pty` is not installed in the active vault plugin folder.

```bash
cd "/PATH/TO/VAULT/.obsidian/plugins/obsidian-any-ai-code"
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
npm run test
npm run build
```

- `npm run dev`: esbuild watch mode
- `npm run build`: compile `main.ts` -> `main.js`

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
2. `npm run test`
3. `npm run build`

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
