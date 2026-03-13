# Lessons Learned

- When adding runtime switches, track selected runtime and running runtime separately; otherwise UI/status can claim the wrong process state during stop/restart transitions.
