# Releases

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
