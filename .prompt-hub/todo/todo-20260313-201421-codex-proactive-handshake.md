# Task: Codex startup proactive terminal handshake

## Context
- User logs show Codex process starts through python PTY bridge but remains blank afterward.

## Plan
- [x] Add proactive terminal handshake write for Codex startup (DSR/DA/OSC responses).
- [x] Keep existing reactive query handling in place as fallback.
- [x] Validate build/tests and document outcome.

## Review
- Added proactive Codex startup handshake in `main.ts` to send terminal response sequences right after process start (and once more shortly after) instead of waiting for reactive detection.
- Kept existing reactive terminal-query responder as a fallback.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
