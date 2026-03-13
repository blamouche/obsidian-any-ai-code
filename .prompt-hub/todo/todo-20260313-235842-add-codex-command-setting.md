# Task: Add Codex command in settings panel

## Context
- User wants a configurable Codex command directly in plugin configuration panel.

## Plan
- [x] Add `codexCommand` setting with default value.
- [x] Use `codexCommand` for Codex runtime launch.
- [x] Add `Codex command` input in settings panel.
- [x] Validate build/tests and update traceability.

## Review
- Added `codexCommand` to persisted plugin settings with sensible default.
- Codex runtime launch now reads command from settings (`codexCommand`) with fallback to default.
- Added `Codex command` text input in settings panel.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
