# Fix: automation prompt truncated when injected into Claude Code v2.1

## Problem
Manual (and CRON) automation launch pastes the prompt into a freshly spawned
Claude Code v2.1 session. The CLI receives only the tail of the prompt (starts
mid-word) and auto-submits a fragment.

Root causes:
1. `CliSession.sendPrompt` writes the raw multi-line body with no bracketed-paste
   markers. Embedded `\n` are read as Enter by ink's input, and Claude Code's
   boot-time re-renders eat the leading characters of the paste.
2. `SESSION_READY_QUIET_MS` (800 ms) fires during a lull in Claude Code v2.1's
   multi-phase startup, so the body is injected before the input widget exists.

## Plan
- [ ] Add pure helper `encodeBracketedPaste(body)` to `session-utils.ts`
      (CRLF/CR -> LF normalize, wrap in ESC[200~ ... ESC[201~).
- [ ] Use it in `CliSession.sendPrompt` (main.ts); keep the trailing `\r` as a
      separate delayed write.
- [ ] Bump `SESSION_READY_QUIET_MS` 800 -> 1200, `SESSION_READY_MAX_MS` 10000 -> 15000.
- [ ] Unit tests for `encodeBracketedPaste`.
- [ ] build + lint + vitest.
- [ ] Version 0.2.18 -> 0.2.19 (manifest.json, package.json, versions.json,
      .prompt-hub/version.md), releases.md, lessons.md, memory.md.
- [ ] Await user go for commit/push.

## Review
- `encodeBracketedPaste(body)` added to `session-utils.ts`: normalizes `\r\n?`
  -> `\n`, wraps in `ESC[200~ … ESC[201~`. No trailing `\r` (caller adds it).
- `CliSession.sendPrompt` now writes `encodeBracketedPaste(text)` instead of the
  raw body; the delayed separate `\r` write is unchanged.
- `SESSION_READY_QUIET_MS` 800 -> 1200, `SESSION_READY_MAX_MS` 10000 -> 15000.
- Tests: +5 cases in `tests/session-utils.test.ts` (24 in file, 79 total) — all pass.
- `npm run lint` clean, `npm run build` OK, change verified present in `main.js`.
- Version 0.2.18 -> 0.2.19 across manifest.json, package.json, versions.json,
  .prompt-hub/version.md; releases.md entry added.
- Status: completed. Commit/push pending user go.

