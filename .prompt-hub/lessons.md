# Lessons Learned

- When adding runtime switches, track selected runtime and running runtime separately; otherwise UI/status can claim the wrong process state during stop/restart transitions.
- Some full-screen CLIs (Codex) can render a blank alternate screen in embedded xterm contexts; prefer inline mode (`--no-alt-screen`) for reliability.
- For persistent embedded black-screen issues, also reset terminal state before launch and force no-color output for readability.
- Some TUIs block on terminal capability queries (`ESC[6n`, `ESC[c`, OSC color requests); provide explicit responses when embedded terminal integration does not reply automatically.
- In this Obsidian embedded context, `script` fallback can fail with `tcgetattr/ioctl`; keep shell-based launch specs for Codex in the Python PTY bridge and surface explicit errors if no TTY path works.
- Proactive terminal handshake injection can be echoed back as raw input in bridge mode; prefer startup-config mitigations over escape-sequence injection.
- If injected terminal response sequences are echoed as raw text, stop injection and instead disable Codex startup prompts/warnings via config flags to reduce hidden interactive blockers.
- Keep xterm `convertEol: true` for mixed CLI streams that emit `\\n` without `\\r`; disabling it causes cumulative horizontal indentation.
- Python PTY bridge must set terminal size explicitly (`TIOCSWINSZ`) using requested cols/rows; otherwise interactive TUI output can degrade into letter-per-line rendering.
- Before writing plugin system notices in terminal, clear the current line (`\\r` + `ESC[2K`) to avoid appending logs onto an active TUI status line.
- Après une correction utilisateur, ne pas conclure "déjà fait" sans revalider explicitement le contexte demandé (branche active, état attendu dans l’UI, et consigne exacte) et proposer l’action corrective immédiate.
- When a plugin advertises a multi-step fallback chain (PTY → python bridge → pipe → script), the entry-point `require()` of any optional native dep MUST be wrapped in try/catch; otherwise a missing dep crashes the process at load time and the fallback chain never gets a chance to run.
- To "press Enter" programmatically into a PTY-attached CLI (Claude, Codex, any raw-mode TUI), write `\r` to stdin, not `\n`. The actual Enter key on a real keyboard sends `\r` to the PTY; raw-mode TUIs read keypresses directly and ignore `\n`. Cooked-mode shells also accept `\r` because the tty line discipline translates it — so `\r` is the safe universal Enter.
- When programmatically pasting text + Enter into a PTY-attached TUI, send the body and the trailing `\r` in **two separate stdin writes** with a short delay (~100–200 ms) between them. Many TUIs (Codex confirmed; Claude tolerant) apply bracketed-paste-style heuristics: a single write containing body+`\r` is treated as a paste and the `\r` becomes a literal newline inside the input field, not the submit key. Splitting the writes lets the paste-detection window close so the `\r` is read as a real Enter keystroke. Claude tolerates the single-write form; Codex does not.
