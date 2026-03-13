# Task: Fix Codex letter-per-line output in python PTY bridge

## Context
- Codex output appears as one character per line in embedded terminal.
- Likely PTY size negotiation issue in python fallback bridge.

## Plan
- [x] Pass cols/rows through proxy payload to python bridge.
- [x] Replace bridge spawn path with explicit PTY fork + winsize setup.
- [x] Validate build/tests and update traceability.

## Review
- Updated `pty-proxy.js` to pass normalized `cols`/`rows` into python bridge payload.
- Reworked `pty-bridge.py` to use explicit PTY fork/exec and apply terminal size (`TIOCSWINSZ`) before streaming.
- Validation:
  - `python3 -m py_compile pty-bridge.py` passed.
  - `python3 pty-bridge.py <payload>` smoke test passed (`OK_BRIDGE`).
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
