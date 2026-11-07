"""Refetch current season data, rebuild CSVs, commit and push.

Runs via launchd on a schedule. Uses the persistent browser profile
so Cloudflare clearance carries over from the initial manual solve.

    python refresh.py             fetch, rebuild, commit and push
    python refresh.py --no-push   leave the commit local
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG = ROOT / "refresh.log"
LOCK = ROOT / ".refresh.lock"
OUTPUTS = ["data/processed"]

# A laptop that wakes at 08:00 fires this before Wi-Fi is up: on 2026-10-08 both
# `git pull` and the Sofascore fetch died on "Could not resolve host", three
# minutes apart, and the whole day's run was lost. Wait for DNS first.
NETWORK_HOSTS = ("github.com", "www.sofascore.com")
NETWORK_WAIT = 900  # seconds; a wake-from-sleep usually reconnects within a minute


def log(msg: str) -> None:
    line = f"{datetime.now():%Y-%m-%d %H:%M} {msg}"
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")
    # Deliberately not printed: launchd redirects stdout into this same file,
    # so printing wrote every line twice.


def wait_for_network(timeout: int = NETWORK_WAIT) -> bool:
    """Block until every host resolves, or give up after `timeout` seconds."""
    deadline = time.time() + timeout
    announced = False
    while True:
        try:
            for host in NETWORK_HOSTS:
                socket.getaddrinfo(host, 443)
            if announced:
                log("network is up")
            return True
        except OSError:
            if time.time() >= deadline:
                return False
            if not announced:
                log("no network yet, waiting...")
                announced = True
            time.sleep(15)


def _running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # it exists, it just isn't ours to signal
    except OSError:
        return False
    return True


def acquire_lock() -> bool:
    """One refresh at a time.

    launchd fires on schedule whether or not the previous run finished, and a
    run can overshoot: the network wait alone is up to 900s, and a blocked
    fetch spends minutes in backoff. With two slots a day that overlap became
    reachable, and two runs would share one botasaurus browser profile and
    race each other on `git commit` and `git push`.
    """
    for _ in range(2):
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            try:
                pid = int(LOCK.read_text(encoding="utf-8").strip() or 0)
            except (OSError, ValueError):
                pid = 0
            if pid and pid != os.getpid() and _running(pid):
                return False
            LOCK.unlink(missing_ok=True)  # stale: the holder died, take it over
            continue
        with os.fdopen(fd, "w") as fh:
            fh.write(str(os.getpid()))
        return True
    return False


def sh(*args: str) -> str:
    done = subprocess.run(
        args, cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
    )
    if done.returncode:
        log(f"FAILED: {' '.join(args)}\n{done.stderr[-2000:]}")
        raise SystemExit(1)
    return done.stdout.strip()


def py(*args: str) -> str:
    return sh(str(Path(sys.executable)), *args)


def main() -> None:
    if not acquire_lock():
        log("another refresh is still running, skipping this slot")
        return
    try:
        _run(push="--no-push" not in sys.argv)
    finally:
        LOCK.unlink(missing_ok=True)


def _run(push: bool) -> None:
    log("refresh started")

    # The wait existed but was only reached from with_retry, so an 08:00 wake
    # still hit `git pull` and the Sofascore fetch with no DNS (2026-11-02).
    if not wait_for_network():
        log(f"no network after {NETWORK_WAIT}s, giving up")
        return

    try:
        sh("git", "pull", "--ff-only")
    except SystemExit:
        log("git pull failed, continuing with local state")

    output = py("data_loader.py")
    for line in output.splitlines():
        if "players" in line.lower() or "matches" in line.lower() or "saved" in line.lower():
            log(line.strip())

    # Supabase + image mirror calls routinely die mid-run when the laptop's
    # Wi-Fi flickers. Retry with backoff and a network wait so the operator
    # doesn't have to kick off a manual re-sync for a transient blip.
    def with_retry(label: str, fn, attempts: int = 3) -> bool:
        for i in range(1, attempts + 1):
            try:
                fn()
                return True
            except Exception as exc:
                log(f"{label} attempt {i}/{attempts} failed: {exc}")
                if i == attempts:
                    log(f"{label} FAILED after {attempts} attempts")
                    return False
                wait_for_network(timeout=120)
                time.sleep(5 * i)
        return False

    from sync_db import sync
    log("syncing to supabase")
    if with_retry("supabase sync", sync):
        log("supabase sync done")

    # Images are cosmetic, and only new ids are fetched, so a failure here must
    # not stop the data commit below.
    from sync_images import sync_images
    log("mirroring images")
    if with_retry("image mirror", sync_images):
        log("image mirror done")

    changed = [
        line[3:] for line in sh("git", "status", "--porcelain", "--", *OUTPUTS).splitlines()
    ]
    if not changed:
        log("nothing new")
        return

    sh("git", "add", *OUTPUTS)
    # Two runs a day, so the time is part of the message.
    sh("git", "commit", "-m", f"refresh {datetime.now():%Y-%m-%d %H:%M}", "--", *OUTPUTS)
    if push:
        sh("git", "push")
    log(f"committed {len(changed)} files" + (" and pushed" if push else ""))


if __name__ == "__main__":
    main()
