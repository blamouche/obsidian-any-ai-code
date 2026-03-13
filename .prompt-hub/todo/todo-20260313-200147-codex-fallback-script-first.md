# Task: Codex fallback hangs after proxy start

## Context
- User logs show Codex starts proxy fallback but emits no UI/output afterward.

## Plan
- [x] Adjust proxy fallback order for Codex to avoid hanging python bridge path.
- [x] Keep generic fallback paths for non-Codex commands unchanged.
- [x] Validate build/tests and document outcome.

## Review
- Updated `pty-proxy.js` fallback strategy for Codex:
  - Codex launch specs now prioritize direct command execution via `/usr/bin/env codex ...` (no shell wrapper).
  - Removed Codex reliance on system `script` fallback in this environment (it fails with `tcgetattr/ioctl`).
  - If Codex cannot launch in PTY bridge and direct pipe, proxy now emits explicit error instead of looping through incompatible fallback.
- Preserved generic fallback chain for non-Codex commands.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
