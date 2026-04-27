# Releases

## 0.1.45 - 2026-04-27
- Trimmed the release standalone assets to the 5 files that actually matter to a hand-assembled plugin folder: required (`manifest.json`, `main.js`, `pty-proxy.js`) and strongly recommended (`styles.css`, `pty-bridge.py`). Dropped `versions.json`, `package.json`, and `package-lock.json` from the standalone list — they remain inside the zip (still uploaded), since they are either runtime-irrelevant (`versions.json`) or only useful for the optional native `node-pty` backend.
- Reworked the release notes body and the README `Required files` section to call out a clear hierarchy (Required vs Recommended vs Optional) instead of listing every file as "indispensable".
- Plugin manifest bumped to 0.1.44.

## 0.1.44 - 2026-04-27
- Release workflow now uploads every runtime-required file at the root of each GitHub release as a standalone asset, not only inside the zip: `manifest.json`, `main.js`, `styles.css`, `versions.json`, `pty-proxy.js`, `pty-bridge.py`, `package.json`, `package-lock.json`.
- Reworked the release notes body template to spell out what each file is for, and to make it explicit that the `main.js` / `manifest.json` / `styles.css` triple is **not sufficient on its own** for this plugin — the child-process proxy (`pty-proxy.js`) and Python fallback (`pty-bridge.py`) must also be present in the plugin folder for the panel to start.
- Mirrored the same explanation in the README `Required files` section.
- Plugin manifest bumped to 0.1.43.

## 0.1.43 - 2026-04-27
- Removed parentheses around the multi-word fallback dropdown labels: `"(No runtime configured)"` → `"No runtime configured"` (sidebar runtime select placeholder + settings tab dropdown). The community bot flagged the parenthesized form even though `eslint-plugin-obsidianmd@0.2.4`'s rule accepts it locally — the bot's stricter scanner appears to treat parenthesized phrases as a sentence continuation, which makes the leading capital incorrect.
- Plugin manifest bumped to 0.1.42.

## 0.1.42 - 2026-04-27
- Removed `Codex` from the `manifest.json` and `package.json` descriptions: confirmed against `eslint-plugin-obsidianmd@0.2.4`'s `DEFAULT_BRANDS` list — `Claude` is recognized but `Codex` is not, so the sentence-case rule treats it as a Title-Case violation mid-sentence. New description: `Run AI coding tools like Claude in a right sidebar terminal panel, with a customizable runtime list.` (still mentions extensibility without naming an unrecognized brand).
- Plugin manifest bumped to 0.1.41.

## 0.1.41 - 2026-04-26
- Capitalized every UI fallback label inside logical-OR expressions (`runtime.name || "(unnamed)"` family) so they pass the bot's stricter sentence-case scan: `(unnamed)` → `(Unnamed)`, `(unnamed runtime)` → `(Unnamed runtime)`, `(no runtime)` → `(No runtime)`. Confirmed via AST walk that the local `obsidianmd/ui/sentence-case` rule's `getStringFromNode` only inspects direct Literals and skips LogicalExpression operands, which is why earlier local lint runs missed these — the bot likely walks fallback expressions.
- Plugin manifest bumped to 0.1.40.

## 0.1.40 - 2026-04-26
- Refreshed `README.md` so the intro, goal, features list, requirements, usage walkthrough, and settings reference reflect the multi-runtime model (the README still presented the plugin as Claude-Code-only).
- Renamed the README title from `Obsidian Any AI Code` to `Any AI CLI` to match the manifest name and updated the Community Plugins enable path accordingly.
- Generalized the troubleshooting `command not found` entry to any configured CLI instead of hardcoding `claude`.

## 0.1.39 - 2026-04-26
- Reworded the `manifest.json` and `package.json` descriptions from `Run AI coding CLIs like Claude Code or Codex from a right sidebar terminal panel.` to `Run AI coding tools like Claude or Codex from a right sidebar terminal panel.` so the Obsidian sentence-case scanner stops flagging the plural acronym `CLIs` and the multi-word product name `Claude Code` as title-case violations.
- Switched the local ESLint config from `obsidianmd/recommended` to `obsidianmd/recommendedWithLocalesEn` (the same severity as the community submission bot) and added explicit ignores for non-source JSON / lockfiles so future stricter checks land in CI.

## 0.1.38 - 2026-04-26
- Installed [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin) (`eslint`, `@typescript-eslint/parser`, `eslint-plugin-obsidianmd`) and added an `eslint.config.mjs` flat config that wires the plugin's `recommended` ruleset to project TS files, with an override turning off `obsidianmd/hardcoded-config-path` for the `tests/` fixtures.
- Added an `npm run lint` script (scoped to `main.ts`, `runtime-utils.ts`, and `tests/**/*.ts`) and wired it into the CI workflow before `npm run test` so guideline violations are caught on every push/PR.
- Fixed every issue surfaced by the local lint run, mapping 1:1 onto the Obsidian automated review:
  - Sentence case: `@Active file`/`@Active folder` → `@active file`/`@active folder`; `(no runtime configured)` → `(No runtime configured)`; ribbon tooltip `Open Any AI CLI` → `Open AI CLI panel`; placeholder `auto` → `Auto`; rephrased descriptions to avoid mid-sentence acronym capitalization (`PTY`, `CLIs`, `Node`).
  - Command palette name no longer includes the plugin name: `Open Any AI CLI` → `Open panel`.
  - Replaced the `globalThis.crypto` UUID fallback in `runtime-utils.ts` with `import { randomUUID } from "node:crypto"`.
  - Awaited the `Workspace.revealLeaf` call (now returns a Promise) and bumped `manifest.json` `minAppVersion` to `1.7.2` (the version that introduced `revealLeaf`).
  - Versions.json maps `0.1.38` to `1.7.2`; older mapped versions stay at `1.5.0` so existing downloads keep resolving as before.

## 0.1.37 - 2026-04-26
- Addressed every issue raised by the Obsidian community-store automated scan:
  - Replaced all `require()` calls in `main.ts` with top-level ES imports for `child_process`, `fs`, `os`, `path` (`@typescript-eslint/no-require-imports`).
  - Removed unnecessary `async` keyword on `onOpen`, `onClose`, `onunload`, and `startClaudeProcess` — these methods had no `await` body, and `onunload` is typed as `void` on `Plugin`. Now they return synchronously (or `Promise.resolve()` where the parent type requires `Promise<void>`).
  - Voided unhandled promises in the ribbon icon and command callbacks (`void this.activateView()` instead of nesting an async arrow that returned `Promise<void>`).
  - Renamed UI labels to sentence case: view display text and command/ribbon labels switched from `CLI AI Assistant` to `Any AI CLI` (the manifest plugin name; only acronyms remain uppercase).
  - Removed the `obsidian-` prefix on the command id (`open-claude-code-panel` → `open-panel`); Obsidian auto-prefixes command ids with the plugin id.
  - Tightened `activateView` so it gracefully bails out when `workspace.getRightLeaf(false)` returns `null` (also clears the only remaining strict-mode TS error).

## 0.1.36 - 2026-04-26
- Renamed plugin id from `obsidian-any-ai-cli` to `any-ai-cli` after the Obsidian community submission bot rejected the previous id (the official guideline asks plugins not to include `obsidian` in their id since the id is used as the plugin folder name and brevity helps sorting). The id `any-ai-cli` is verified free in the public `community-plugins.json`.
- Updated all id-referencing files: `manifest.json`, `package.json`, `package-lock.json`, `.github/workflows/release.yml` (`PLUGIN_ID`), and the README install paths and zip filename mentions.
- Existing personal installs need to rename their plugin folder from `.obsidian/plugins/obsidian-any-ai-cli` (or `obsidian-any-ai-code`) to `.obsidian/plugins/any-ai-cli`.

## 0.1.35 - 2026-04-26
- Renamed the plugin id from `obsidian-any-ai-code` to `obsidian-any-ai-cli` so it matches the rebranded `Any AI CLI` plugin name (and matches the entry queued for the Obsidian community store submission).
- Updated `manifest.json` `id`, `package.json` `name`, the release workflow `PLUGIN_ID` env var, and every install path / release zip filename mentioned in the README.
- Existing personal installs need to rename their plugin folder from `.obsidian/plugins/obsidian-any-ai-code` to `.obsidian/plugins/obsidian-any-ai-cli` (one-time manual step). No external user is affected since the plugin is not yet on the community store.

## 0.1.34 - 2026-04-26
- Aligned the plugin with the Obsidian community plugin submission guidelines:
  - Added a top-level `LICENSE` file (MIT) so the license is discoverable independently of `package.json`.
  - Removed the `leaf.detach()` calls from `onunload` (Obsidian preserves leaf state across reloads/updates per the plugin guidelines).
  - Reworked the settings tab to use `new Setting(...).setHeading()` instead of raw `<h2>`/`<h3>` elements; dropped the redundant top-level plugin-name heading and the heading on the first general-settings section per the UI text guidelines.
  - Switched the release workflow to publish drafts (`draft: true`), matching the official Obsidian release guide so the author reviews release notes before going live.
  - Tightened the `manifest.json` description to a more action-oriented, unambiguous statement: `Run AI coding CLIs like Claude Code or Codex from a right sidebar terminal panel.`

## 0.1.33 - 2026-04-26
- Added a blue highlight accent to `@Active file` and `@Active folder` buttons (resting border tint + icon color, solid blue fill with white text/icon on hover) so the file-context actions read as a paired group distinct from the green Start and red Stop.

## 0.1.32 - 2026-04-26
- Added an `@Active folder` button on the sidebar's secondary row that inserts the parent folder of the active file (vault-relative) into the running CLI.
- Active files at the vault root insert `@./ ` (current working directory marker) so the action remains useful regardless of file location.
- Added unit tests covering nested, deeply-nested, root, empty, and whitespace-padded paths (27 tests total).

## 0.1.31 - 2026-04-26
- Fixed `Stop` hover unreadable text by switching to a solid red background with white text/icon (instead of red text on a translucent red background).
- Replaced the native dropdown chrome on the runtime picker (which rendered as a black/white control on macOS) with a styled wrapper that matches the toolbar buttons, using `appearance: none` and a custom Lucide chevron icon.
- Switched the `Start` button accent from the Obsidian theme accent to a green color (`var(--color-green)` with `#16a34a` fallback) for a clearer "go" semantic, including hover fill and resting border tint.

## 0.1.30 - 2026-04-26
- Polished sidebar toolbar buttons: smoother hover/active transitions, subtle shadow on hover, focus-visible outline ring, dimmed disabled state, and icon color shift on hover.
- Added semantic accents — `Start` highlights with the Obsidian accent color on hover (primary action), `Stop` highlights with the error color on hover (destructive action).
- Aligned the runtime dropdown styling with the buttons (matching transitions, hover lift, accent focus ring).

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
