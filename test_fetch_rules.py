"""Self-check for the fetch-skipping rules. Run: python test_fetch_rules.py

Plain asserts, no framework. These guard the branches that decide whether a
request or an upsert happens at all, which is where the cost lives.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from tempfile import TemporaryDirectory

import data_loader as dl
import refresh
import sync_db

NOW = 1_762_000_000.0  # a fixed "now" so the cases don't drift with the clock
DAY = 86_400


def _round(tmp: Path, name: str, events: list[dict], age_days: float = 0.0) -> Path:
    f = tmp / name
    f.write_text(json.dumps({"events": events}), encoding="utf-8")
    import os
    t = NOW - age_days * DAY
    os.utime(f, (t, t))
    return f


def ev(kickoff: float, finished: bool) -> dict:
    return {
        "startTimestamp": kickoff,
        "status": {"type": "finished" if finished else "notstarted"},
    }


def test_round_rules() -> None:
    with TemporaryDirectory() as d:
        tmp = Path(d)

        # Never fetched: always go and get it.
        assert dl._round_needs_refetch(tmp / "missing.json", NOW) is True

        # Played out and a week old: settled, never ask again.
        f = _round(tmp, "old.json", [ev(NOW - 7 * DAY, True), ev(NOW - 8 * DAY, True)])
        assert dl._round_needs_refetch(f, NOW) is False

        # Finished yesterday: inside the correction window, still refetch.
        f = _round(tmp, "fresh.json", [ev(NOW - DAY, True)])
        assert dl._round_needs_refetch(f, NOW) is True

        # One match still to play: the round is live, refetch.
        f = _round(tmp, "mixed.json", [ev(NOW - DAY, True), ev(NOW + DAY, False)])
        assert dl._round_needs_refetch(f, NOW) is True

        # Months out and fetched today: leave it until the weekly pass.
        f = _round(tmp, "far.json", [ev(NOW + 90 * DAY, False)], age_days=1)
        assert dl._round_needs_refetch(f, NOW) is False

        # Months out but the cache is stale: take the weekly look.
        f = _round(tmp, "far-stale.json", [ev(NOW + 90 * DAY, False)], age_days=9)
        assert dl._round_needs_refetch(f, NOW) is True

        # Soon, so it moves: refetch.
        f = _round(tmp, "soon.json", [ev(NOW + 3 * DAY, False)], age_days=0)
        assert dl._round_needs_refetch(f, NOW) is True

        # Unreadable or empty cache must not silently freeze a round.
        f = tmp / "junk.json"
        f.write_text("not json", encoding="utf-8")
        assert dl._round_needs_refetch(f, NOW) is True
        f = _round(tmp, "empty.json", [])
        assert dl._round_needs_refetch(f, NOW) is True


def test_season_map() -> None:
    m = dl._season_map({"seasons": [{"year": "26/27", "id": 1}, {"year": "2025", "id": 2}]})
    assert m == {2026: 1, 2025: 2}, m
    assert dl._season_map({}) == {}


def test_seasons_cache_is_not_refetched() -> None:
    """refresh=True must not re-request a seasons list that already has it."""
    calls: list[str] = []
    real_get, real_raw = dl._get, dl.RAW
    with TemporaryDirectory() as d:
        dl.RAW = Path(d)
        (dl.RAW / "seasons_99.json").write_text(
            json.dumps({"seasons": [{"year": "26/27", "id": 7}]}), encoding="utf-8"
        )

        def fake_get(url, cache, refresh=False):
            calls.append(f"{'NET' if refresh else 'CACHE'} {url}")
            return json.loads(Path(cache).read_text(encoding="utf-8"))

        dl._get = fake_get
        try:
            assert dl.get_season_ids(99, refresh=True, want=2026) == {2026: 7}
            assert calls == ["CACHE …".replace("…", f"{dl.SOFASCORE}/api/v1/unique-tournament/99/seasons")], calls
            # A season the cache has never heard of still goes to the network.
            dl.get_season_ids(99, refresh=True, want=2027)
            assert calls[-1].startswith("NET"), calls
        finally:
            dl._get, dl.RAW = real_get, real_raw


def test_circuit_breaker() -> None:
    before = dl._refusals
    try:
        dl._refusals = 0
        for i in range(dl.REFUSAL_LIMIT - 1):
            dl._refused(f"403 #{i}")          # below the limit: keep going
        raised = False
        try:
            dl._refused("403 final")
        except dl.Blocked:
            raised = True
        assert raised, "breaker never tripped"
        # Not a RuntimeError, or fetch_match_stats/fetch_roles would swallow it.
        assert not issubclass(dl.Blocked, RuntimeError)
    finally:
        dl._refusals = before


def test_sync_skips_unchanged() -> None:
    """An up-to-date state file means sync() must not even open a connection."""
    real_state, real_connect = sync_db.STATE, sync_db._connect
    with TemporaryDirectory() as d:
        sync_db.STATE = Path(d) / "state.json"
        files = [
            f for pattern, _, _ in sync_db.TABLES
            for f in sorted(sync_db.PROCESSED.glob(pattern))
        ]
        assert files, "no processed CSVs to check against"
        sync_db._write_state({f.name: sync_db._digest(f) for f in files})

        def boom():
            raise AssertionError("sync() connected despite nothing changing")

        sync_db._connect = boom
        try:
            sync_db.sync()                     # must return before connecting
            # force=True ignores the state, so it does try to connect.
            tried = False
            try:
                sync_db.sync(force=True)
            except AssertionError:
                tried = True
            assert tried, "force=True skipped the sync"
        finally:
            sync_db.STATE, sync_db._connect = real_state, real_connect


def test_lock() -> None:
    """A live holder blocks the slot; a dead one is taken over."""
    real = refresh.LOCK
    with TemporaryDirectory() as d:
        refresh.LOCK = Path(d) / ".refresh.lock"
        try:
            assert refresh.acquire_lock() is True
            assert refresh.LOCK.read_text() == str(__import__("os").getpid())

            # Someone else alive holds it: skip the slot rather than overlap.
            refresh.LOCK.write_text("1")          # pid 1 (launchd) is always up
            assert refresh.acquire_lock() is False

            # Holder is gone: the lock is stale and ours to take.
            refresh.LOCK.write_text("999999")
            assert refresh.acquire_lock() is True

            # Garbage in the file must not wedge the schedule forever.
            refresh.LOCK.write_text("not a pid")
            assert refresh.acquire_lock() is True
        finally:
            refresh.LOCK.unlink(missing_ok=True)
            refresh.LOCK = real


def test_status_is_not_collapsed() -> None:
    """A postponed fixture is neither finished nor upcoming.

    Everything that was not "finished" used to be written as "upcoming", so a
    16 September Levante UD v Athletic Club that Sofascore marks `postponed`
    sat at the top of /predictions' "Next up" for seven weeks while the
    replayed match — a separate event id — was finished. 15 such rows were in
    the database when this was found.
    """
    cases = [
        ("postponed", "postponed"),
        ("canceled", "canceled"),
        ("cancelled", "canceled"),   # spelling varies in the feed
        ("finished", "finished"),
        ("notstarted", "upcoming"),
        ("inprogress", "upcoming"),
        ("", "upcoming"),
        ("something new", "upcoming"),
    ]
    for given, want in cases:
        assert dl._status_of({"status": {"type": given}}) == want, given
    # Malformed rows must not crash the whole round.
    assert dl._status_of({}) == "upcoming"
    assert dl._status_of({"status": None}) == "upcoming"


def _intl_event(eid: int, kickoff: float, league: str, home: str, away: str) -> dict:
    return {
        "id": eid,
        "startTimestamp": kickoff,
        "status": {"type": "notstarted"},
        "homeTeam": {"name": home, "id": 1},
        "awayTeam": {"name": away, "id": 2},
        "homeScore": {},
        "awayScore": {},
        "tournament": {"name": "UEFA Nations League, League A, Gr. 3",
                       "uniqueTournament": {"name": "UEFA Nations League"}},
    }


def test_international_fetch() -> None:
    """Per-team fetching must dedupe the tie both sides return, drop results
    older than the window, and never pull national squads into `players`."""
    # The leaderboards break quietly if these ever share a dict.
    assert not set(dl.NATIONAL_TEAMS) & set(dl.LEAGUES)

    old = time.time() - (dl.INTERNATIONAL_BACKFILL_DAYS + 5) * DAY
    payload = {
        ("next", 4698): [_intl_event(9001, time.time() + DAY, "x", "Spain", "England")],
        ("last", 4698): [_intl_event(9002, old, "x", "Spain", "Croatia")],
        # England returns the same upcoming tie from its own side.
        ("next", 4713): [_intl_event(9001, time.time() + DAY, "x", "Spain", "England")],
        ("last", 4713): [],
    }

    real_get, real_teams = dl._get, dl.NATIONAL_TEAMS
    dl.NATIONAL_TEAMS = {"Spain": 4698, "England": 4713}
    try:
        def fake_get(url: str, cache, refresh: bool = False) -> dict:
            tid = int(url.split("/team/")[1].split("/")[0])
            kind = "next" if "/next/" in url else "last"
            return {"events": payload.get((kind, tid), [])}

        dl._get = fake_get
        df = dl.fetch_international_matches(2026)
    finally:
        dl._get, dl.NATIONAL_TEAMS = real_get, real_teams

    assert list(df["event_id"]) == [9001], list(df["event_id"])  # deduped, 9002 too old
    row = df.iloc[0]
    assert row["league"] == "UEFA Nations League"  # the short name, not the group label
    assert row["season"] == "2026/27"
    assert row["date"] and row["kickoff"].endswith("Z")


def test_duplicate_friendlies_collapse() -> None:
    """Sofascore lists some friendlies twice. The live list must draw one."""
    import pandas as pd

    df = pd.DataFrame([
        # Same tie, two ids, both with the midnight placeholder: newer id wins.
        {"event_id": 1, "date": "2026-11-14", "kickoff": "2026-11-14T00:00:00Z",
         "home": "Colombia", "away": "Chile"},
        {"event_id": 2, "date": "2026-11-14", "kickoff": "2026-11-14T00:00:00Z",
         "home": "Colombia", "away": "Chile"},
        # Same tie, one real kickoff: the real one wins despite the older id.
        {"event_id": 9, "date": "2026-11-17", "kickoff": "2026-11-17T00:00:00Z",
         "home": "Argentina", "away": "Costa Rica"},
        {"event_id": 3, "date": "2026-11-17", "kickoff": "2026-11-17T15:00:00Z",
         "home": "Argentina", "away": "Costa Rica"},
        # A real second fixture between the same sides on another day stays.
        {"event_id": 4, "date": "2026-11-18", "kickoff": "2026-11-18T19:00:00Z",
         "home": "Argentina", "away": "Costa Rica"},
    ])
    out = dl._dedupe_fixtures(df)
    assert list(out["event_id"]) == [2, 3, 4], list(out["event_id"])


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok  {name}")
    print("all good")
