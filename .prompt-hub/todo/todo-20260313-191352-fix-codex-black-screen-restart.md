# Task: Fix Codex black screen on restart

## Context
- User reports black screen when restarting while Codex runtime is selected.

## Plan
- [x] Adjust Codex launch mode to be robust in embedded terminal rendering.
- [x] Keep restart/switch flow unchanged and ensure terminal shows output after restart.
- [x] Validate build/tests and document outcome.

## Review
- Updated Codex runtime command to launch with `--no-alt-screen` in embedded terminal mode to prevent blank alternate-screen rendering after restart.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
