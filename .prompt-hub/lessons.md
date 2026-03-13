# Lessons Learned

- When adding runtime switches, track selected runtime and running runtime separately; otherwise UI/status can claim the wrong process state during stop/restart transitions.
- Some full-screen CLIs (Codex) can render a blank alternate screen in embedded xterm contexts; prefer inline mode (`--no-alt-screen`) for reliability.
