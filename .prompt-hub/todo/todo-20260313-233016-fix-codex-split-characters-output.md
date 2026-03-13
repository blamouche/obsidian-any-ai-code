# Task: Fix split-character Codex output rendering

## Context
- Codex output is visible but rendered with broken spacing/newlines (characters split across lines).

## Plan
- [x] Adjust xterm EOL handling to avoid double/newline distortion in interactive TUI output.
- [x] Validate with build/tests.
- [x] Update traceability files and push.

## Review
- Updated xterm initialization to use `convertEol: false` (default terminal behavior) to avoid newline distortion in Codex interactive output.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
