# Task: Codex fallback hangs after proxy start

## Context
- User logs show Codex starts proxy fallback but emits no UI/output afterward.

## Plan
- [x] Adjust proxy fallback order for Codex to avoid hanging python bridge path.
- [x] Keep generic fallback paths for non-Codex commands unchanged.
- [x] Validate build/tests and document outcome.

## Review
- Updated `pty-proxy.js` fallback strategy: when command is `codex` and `node-pty` fails, proxy now tries system `script` pseudo-TTY fallback before python bridge.
- Preserved existing fallback chain for non-Codex commands.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
