# Task: Fix indented terminal output formatting

## Context
- Output lines are increasingly indented/misaligned in embedded terminal after recent changes.
- Root cause: xterm `convertEol=false` keeps cursor column on `\n`-only lines.

## Plan
- [x] Restore xterm `convertEol: true`.
- [x] Validate build/tests.
- [x] Update traceability artifacts and push.

## Review
- Restored xterm `convertEol: true` so lines ending with `\\n` reset correctly to column 0 in embedded output streams.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
