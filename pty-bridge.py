#!/usr/bin/env python3
import base64
import json
import os
import pty
import sys


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
    if not launches:
        print("[py-bridge-error] no launch specs provided", file=sys.stderr)
        return 1

    failures = []
    for launch in launches:
        file = launch.get("file")
        args = launch.get("args") or []
        argv = [str(file)] + [str(x) for x in args]
        try:
            status = pty.spawn(argv)
            return as_exit_code(status)
        except OSError as error:
            failures.append(f"{file}: {error}")

    print(f"[py-bridge-error] all launch attempts failed: {' | '.join(failures)}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
