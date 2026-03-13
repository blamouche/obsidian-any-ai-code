# Task: Toolbar switch between Claude and Codex

## Context
- User wants to switch runtime target (Claude/Codex) from the interface directly, without opening settings.

## Plan
- [x] Inspect current toolbar and process start flow to identify where command selection is resolved.
- [x] Add an in-view switch (Claude/Codex) and wire it to process launch and status display.
- [x] Validate behavior with build/tests and document outcome.

## Review
- Added a two-button runtime switch (`Claude` / `Codex`) in the toolbar.
- Runtime selection is persisted in settings and applied to the next process start.
- Start/stop/status messages now adapt to the selected runtime.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
