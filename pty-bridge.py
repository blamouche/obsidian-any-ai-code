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


def stream_pty(pid: int, fd: int) -> int:
    stdin_open = True
    while True:
        readers = [fd]
        if stdin_open:
            readers.append(sys.stdin.fileno())

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
            return stream_pty(pid, fd)
        except OSError as error:
            failures.append(f"{file}: {error}")

    print(f"[py-bridge-error] all launch attempts failed: {' | '.join(failures)}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
