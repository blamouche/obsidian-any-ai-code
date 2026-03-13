# Task: Fix Codex persistent black screen

## Context
- User still reports black screen after previous Codex restart fixes.

## Plan
- [x] Reset embedded terminal state before Codex launch to clear stale screen modes.
- [x] Launch Codex with safer display env settings for embedded terminal readability.
- [x] Validate build/tests and document outcome.

## Review
- Added terminal reset before Codex launch to clear stale terminal modes that can lead to blank rendering after restart.
- Added Codex-specific env overrides (`NO_COLOR=1`, `CLICOLOR=0`, `FORCE_COLOR=0`) to avoid unreadable color output in embedded xterm.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
