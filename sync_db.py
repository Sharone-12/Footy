"""Push processed CSVs to Supabase. Idempotent — uses upsert via ON CONFLICT."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

PROCESSED = Path(__file__).resolve().parent / "data" / "processed"
# Lives under data/raw/ because that path is gitignored; data/processed/ is
# committed wholesale by refresh.py and this is machine-local bookkeeping.
STATE = Path(__file__).resolve().parent / "data" / "raw" / ".sync_state.json"

TABLES = [
    ("players_*.csv", "players", ["player_id", "season", "league"]),
    ("matches_*.csv", "matches", ["event_id"]),
    ("match_stats_*.csv", "match_stats", ["event_id", "stat"]),
]


def _connect():
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env.local")
    url = os.environ["POSTGRES_URL_NON_POOLING"].split("?")[0]
    return psycopg2.connect(url)


def _upsert_csv(cur, path: Path, table: str, conflict_cols: list[str]):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        rows = []
        for row in reader:
            rows.append(tuple(row[c] if row[c] != "" else None for c in cols))
    if not rows:
        return 0
    conflict_idxs = [cols.index(c) for c in conflict_cols]
    seen = set()
    deduped = []
    for r in rows:
        key = tuple(r[i] for i in conflict_idxs)
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    rows = deduped
    col_names = ",".join(cols)
    update_cols = [c for c in cols if c not in conflict_cols]
    on_conflict = ",".join(conflict_cols)
    set_clause = ",".join(f"{c}=EXCLUDED.{c}" for c in update_cols)
    q = (
        f"INSERT INTO {table} ({col_names}) VALUES %s "
        f"ON CONFLICT ({on_conflict}) DO UPDATE SET {set_clause}"
    )
    execute_values(cur, q, rows, page_size=500)
    return len(rows)


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sync(force: bool = False):
    """Upsert every processed CSV whose contents changed since the last sync.

    Every row used to go up on every run — 64,822 of them for roughly 170 that
    had actually changed, and over half of that a finished season that is
    byte-identical day after day. Pass force=True (or `--force`) after a schema
    change, a manual edit to the database, or a restore.
    """
    candidates = [
        (f, table, keys)
        for pattern, table, keys in TABLES
        for f in sorted(PROCESSED.glob(pattern))
    ]
    digests = {f.name: _digest(f) for f, _, _ in candidates}
    state = {} if force else _read_state()
    pending = [c for c in candidates if state.get(c[0].name) != digests[c[0].name]]
    skipped = len(candidates) - len(pending)

    if not pending:
        print(f"  nothing changed, {skipped} files already in sync", flush=True)
        return

    conn = _connect()
    cur = conn.cursor()
    total = 0
    done = dict(state)
    try:
        for f, table, keys in pending:
            n = _upsert_csv(cur, f, table, keys)
            conn.commit()
            print(f"  {table} {f.stem}: {n} rows", flush=True)
            total += n
            # Recorded per file, so a crash halfway only re-syncs what is left.
            done[f.name] = digests[f.name]
            _write_state(done)
    finally:
        cur.close()
        conn.close()
    print(f"  synced {total} rows, skipped {skipped} unchanged files", flush=True)


def _read_state() -> dict[str, str]:
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_state(state: dict[str, str]) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, sort_keys=True, indent=1), encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=sync.__doc__)
    ap.add_argument("--force", action="store_true", help="re-upsert every CSV")
    sync(force=ap.parse_args().force)
