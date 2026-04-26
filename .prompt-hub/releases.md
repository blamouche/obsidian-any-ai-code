# Releases

## 0.1.29 - 2026-04-26
- Reorganized the sidebar toolbar into two rows: row 1 holds the runtime dropdown followed by `Start`, `Stop`, `Restart`, `Clear`; row 2 holds the `@Active file` button on its own line.

## 0.1.28 - 2026-04-26
- Replaced the hardcoded Claude/Codex runtime switch with a customizable, unbounded list of CLI runtimes configurable from the settings panel.
- Each runtime entry stores a display name and a launch command; users can add new runtimes with `Add runtime` and remove unused ones (a single runtime is always kept).
- The sidebar toolbar now exposes a dropdown populated with the configured runtimes (replacing the previous Claude/Codex toggle buttons).
- Added a migration path that converts legacy `command`, `codexCommand`, and `runtime` settings into the new `runtimes` + `selectedRuntimeId` shape on first load.
- The Codex-specific terminal workarounds (no-color env, terminal reset) now trigger by command shape (`isCodexLikeCommand`) instead of a hardcoded id, so they keep working for any user-renamed Codex entry.
- README updated to document the new settings shape and runtime dropdown behavior.
- Added unit tests for the new migration helper and codex-like command detection (22 tests total).

## 0.1.27 - 2026-04-26
- Added a project banner image at the top of the README (`img/banner.png`).

## 0.1.26 - 2026-04-25
- Reworked the README `Install in a Vault` section around the GitHub release zip flow (download zip → unzip into `.obsidian/plugins/` → enable), with the native `node-pty` install demoted to an optional step for best terminal fidelity.
- Updated the release workflow body template to drop the mandatory `npm install --omit=dev` step (no longer required since 0.1.25 made the native dep optional) and reframed it as an optional enhancement.
- Added a `Release` section to the README documenting how the release workflow runs and which files it ships.
- Updated the `Cannot find module 'node-pty'` troubleshooting note to reflect that this no longer crashes the plugin.

## 0.1.25 - 2026-04-25
- Fixed `Cannot find module 'node-pty'` crash on plugin start when the native dep is missing (e.g. user did not run `npm install --omit=dev` after unzipping the release).
- Made the `node-pty` import optional in `pty-proxy.js`: if loading fails, the proxy now falls through cleanly to the existing Python bridge / direct pipe / `script` fallback chain instead of dying at top-level `require`.

## 0.1.24 - 2026-04-25
- Updated the Release workflow to bundle every runtime file required by the plugin (`manifest.json`, `main.js`, `styles.css`, `versions.json`, `pty-proxy.js`, `pty-bridge.py`, `package.json`, `package-lock.json`) into a single zip asset (`obsidian-any-ai-code-<tag>.zip`) for one-click install.
- Added install instructions to the auto-generated release body explaining how to drop the unzipped folder into `.obsidian/plugins/` and install native deps via `npm install --omit=dev`.
- Kept `main.js`, `manifest.json`, and `styles.css` as standalone release assets for Obsidian's plugin update protocol / BRAT compatibility.

## 0.1.23 - 2026-04-25
- Added a `Release` GitHub Actions workflow triggered on tag pushes (`tags: ['*']`).
- The workflow installs deps, runs the production build, verifies that the Obsidian plugin assets exist, and publishes a GitHub Release with `main.js`, `manifest.json`, and `styles.css` attached as standalone assets (matching Obsidian community plugin conventions).
- Auto-generates release notes from the commit history (`generate_release_notes: true`).

## 0.1.22 - 2026-03-17
- Translated the toolbar mention button label from `@Fichier actif` to `@Active file`.
- Updated the corresponding button tooltip/accessible label to English for consistency.

## 0.1.21 - 2026-03-17
- Reworked the settings screen structure for better visual and functional coherence with grouped sections: `Runtime behavior`, `Commands`, and `Advanced`.
- Made setting labels/descriptions more consistent (including explicit `Claude command` naming).
- Changed default behavior so `Auto-restart on runtime switch` is now enabled by default.

## 0.1.20 - 2026-03-17
- Changed module icon to a robot-style icon (`bot`).
- Changed module hover/title label to `CLI AI Assistant`.
- Updated ribbon icon/tooltip and command label for consistent naming.

## 0.1.19 - 2026-03-17
- Process compliance update: strengthened correction handling by adding an explicit lesson to revalidate requested context before concluding no change is needed.

## 0.1.18 - 2026-03-14
- Improved toolbar UI by adding Obsidian/Lucide pictograms to action buttons and runtime switch buttons.
- Added icon-specific alignment/sizing styles for cleaner button presentation.

## 0.1.17 - 2026-03-14
- Added an `Auto-restart on runtime switch` option in plugin settings.
- When enabled, switching runtime (`Claude`/`Codex`) from the toolbar automatically restarts the running process to apply the selected runtime immediately.

## 0.1.16 - 2026-03-14
- Added a `Default runtime` switch in plugin settings (`Claude` / `Codex`) to choose which runtime is selected and launched by default at panel startup.
- Updated `Auto-start` setting description to reflect that it starts the selected default runtime.

## 0.1.15 - 2026-03-13
- Added a dedicated `Codex command` setting in the plugin configuration panel.
- Codex runtime launch now uses configurable `codexCommand` settings value instead of a hardcoded command.

## 0.1.14 - 2026-03-13
- Fixed cumulative indentation/misaligned output by restoring xterm EOL conversion (`convertEol: true`) for mixed CLI streams that emit LF-only line endings.

## 0.1.13 - 2026-03-13
- Added terminal-safe plugin logging helper that clears the active line before printing system messages, preventing `Runtime selected` / `Starting` notices from being appended to active Codex status lines.

## 0.1.12 - 2026-03-13
- Fixed python PTY fallback sizing by propagating requested cols/rows from the proxy and applying them in `pty-bridge.py` via `TIOCSWINSZ` at startup.
- Reworked python bridge execution from `pty.spawn` convenience mode to explicit PTY fork/exec streaming for deterministic terminal sizing.

## 0.1.11 - 2026-03-13
- Fixed split-character / broken newline rendering in embedded Codex output by disabling forced xterm EOL conversion (`convertEol: false`).

## 0.1.10 - 2026-03-13
- Removed Codex startup escape-sequence injection that was being echoed as raw input in bridge mode.
- Updated Codex launch command to disable startup update/warning prompts (`check_for_update_on_startup=false`, `hide_full_access_warning=true`, `hide_world_writable_warning=true`, `hide_rate_limit_model_nudge=true`) for better embedded-terminal compatibility.

## 0.1.9 - 2026-03-13
- Added proactive Codex startup handshake in the view layer (DSR/DA/OSC replies sent immediately after process start, then retried once) to unblock bridge-mode startup stalls.

## 0.1.8 - 2026-03-13
- Restored shell-based Codex launch specs in PTY bridge mode after direct `/usr/bin/env codex ...` launch caused startup stalls in this embedded environment.
- Kept the removal of incompatible `script` fallback for Codex and retained explicit error propagation when no launch path works.

## 0.1.7 - 2026-03-13
- Reworked Codex launch specs to run directly via `/usr/bin/env codex ...` (without shell wrapper) in PTY fallback paths.
- Removed Codex reliance on system `script` fallback in this environment due `tcgetattr/ioctl` failures, and now surfaces explicit proxy errors when no compatible launch path works.

## 0.1.6 - 2026-03-13
- Updated proxy fallback strategy for Codex: when `node-pty` is unavailable, try system `script` pseudo-TTY fallback before python bridge to avoid hangs after startup.

## 0.1.5 - 2026-03-13
- Added terminal query auto-response handling for Codex startup (`ESC[6n`, `ESC[c`, OSC 10/11) to prevent black-screen stalls when embedded terminal replies are missing.

## 0.1.4 - 2026-03-13
- Added terminal reset before Codex launches to clear stale display modes that can cause blank rendering after restart.
- Added Codex launch env overrides (`NO_COLOR=1`, `CLICOLOR=0`, `FORCE_COLOR=0`) to improve embedded terminal readability.

## 0.1.3 - 2026-03-13
- Fixed Codex black screen behavior in the embedded terminal by launching Codex in inline mode (`codex --no-alt-screen`) instead of alternate-screen mode.

## 0.1.2 - 2026-03-13
- Fixed runtime-switch flow so `Start` now performs a graceful switch when selected runtime differs from running runtime (stop current process, auto-start selected runtime after exit).
- Added explicit tracking of selected runtime vs running runtime for accurate stop/status messages.
- Manual `Stop` now cancels pending auto-restart requests.

## 0.1.1 - 2026-03-13
- Fixed dropped early process output/events by attaching PTY proxy listeners immediately and buffering startup data until UI callbacks register.
- This makes Codex startup errors and early logs visible instead of appearing as a blank terminal.
- Updated runtime-not-running message for active-file mention insertion to match selected runtime.

## 0.1.0 - 2026-03-13
- Added an in-panel runtime switch (`Claude` / `Codex`) so users can choose which CLI to launch without opening plugin settings.
- Persisted runtime choice and applied it to start/restart behavior, with runtime-aware status/terminal messages.

## 0.0.6 - 2026-03-13
- Improved `@Fichier actif` button behavior by automatically restoring focus to the embedded CLI terminal after inserting the mention.

## 0.0.5 - 2026-03-13
- Changed active-file mention insertion to use the full vault-relative path (`activeFile.path`) instead of filename only.
- Updated mention helper tests to cover path-based mention formatting.

## 0.0.4 - 2026-03-13
- Added a new `@Fichier actif` button in the Claude toolbar to inject `@<active-file>.md` into the terminal input.
- Added mention formatting helper and unit tests for mention generation behavior.

## 0.0.3 - 2026-03-13
- Added session memory log entry covering governance versioning and repository synchronization (`git commit` + `git push`).

## 0.0.2 - 2026-03-13
- Applied mandatory `agents.md` startup workflow for this session.
- Added/updated Prompt Hub governance artifacts: `.last-update-check`, `lessons.md`, task todo initialization, and memory log entries.

## 0.0.1 - 2026-03-06
- Fixed ghost characters displayed above the embedded CLI terminal by aligning accessibility-related xterm styles in `styles.css`.
- Added hidden styling for xterm measurement/accessibility elements to prevent visual artifacts.
