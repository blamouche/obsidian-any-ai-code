#!/usr/bin/env python3
import base64
import json
import os
import pty
import fcntl
import select
import struct
import sys
import termios


def decode_payload(raw: str):
    if not raw:
        raise ValueError("missing payload")
    decoded = base64.b64decode(raw.encode("utf-8")).decode("utf-8")
    return json.loads(decoded)


def as_exit_code(status: int) -> int:
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    if os.WIFSIGNALED(status):
        return 128 + os.WTERMSIG(status)
    return 1


def set_winsize(fd: int, rows: int, cols: int) -> None:
    packed = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, packed)


def open_control_fd(control_fd):
    """Resize channel set up by pty-proxy.js: lines of "<cols> <rows>"."""
    if not isinstance(control_fd, int):
        return None
    try:
        os.fstat(control_fd)
    except OSError:
        return None
    # Keep it out of the launched CLI (closed on exec).
    os.set_inheritable(control_fd, False)
    return control_fd


def apply_resize_lines(fd: int, pending: bytes) -> bytes:
    *lines, rest = pending.split(b"\n")
    for line in lines:
        try:
            cols_text, rows_text = line.decode("ascii").split()
            # The kernel signals SIGWINCH to the CLI when the size changes.
            set_winsize(fd, max(10, int(rows_text)), max(20, int(cols_text)))
        except (ValueError, OSError):
            continue
    return rest


def stream_pty(pid: int, fd: int, control_fd=None) -> int:
    stdin_open = True
    control_pending = b""
    while True:
        readers = [fd]
        if stdin_open:
            readers.append(sys.stdin.fileno())
        if control_fd is not None:
            readers.append(control_fd)

        ready, _, _ = select.select(readers, [], [])
        if fd in ready:
            try:
                chunk = os.read(fd, 4096)
            except OSError:
                chunk = b""
            if not chunk:
                break
            os.write(sys.stdout.fileno(), chunk)

        if stdin_open and sys.stdin.fileno() in ready:
            try:
                chunk = os.read(sys.stdin.fileno(), 4096)
            except OSError:
                chunk = b""
            if not chunk:
                stdin_open = False
            else:
                os.write(fd, chunk)

        if control_fd is not None and control_fd in ready:
            try:
                chunk = os.read(control_fd, 1024)
            except OSError:
                chunk = b""
            if not chunk:
                control_fd = None
            else:
                control_pending = apply_resize_lines(fd, control_pending + chunk)

    _, status = os.waitpid(pid, 0)
    return as_exit_code(status)


def main() -> int:
    payload = decode_payload(sys.argv[1] if len(sys.argv) > 1 else "")

    cwd = payload.get("cwd")
    if cwd:
        os.chdir(cwd)

    env = payload.get("env") or {}
    for key, value in env.items():
        if value is None:
            continue
        os.environ[str(key)] = str(value)

    launches = payload.get("launches") or []
    cols = int(payload.get("cols") or 120)
    rows = int(payload.get("rows") or 30)
    cols = max(20, cols)
    rows = max(10, rows)
    control_fd = open_control_fd(payload.get("control_fd"))
    if not launches:
        print("[py-bridge-error] no launch specs provided", file=sys.stderr)
        return 1

    failures = []
    for launch in launches:
        file = launch.get("file")
        args = launch.get("args") or []
        argv = [str(file)] + [str(x) for x in args]
        try:
            pid, fd = pty.fork()
            if pid == 0:
                os.execvpe(str(file), argv, os.environ)

            set_winsize(fd, rows, cols)
            return stream_pty(pid, fd, control_fd)
        except OSError as error:
            failures.append(f"{file}: {error}")

    print(f"[py-bridge-error] all launch attempts failed: {' | '.join(failures)}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
