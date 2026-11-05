"""Mirror FC Barcelona's own squad cutouts and shirt numbers.

Sofascore gives us neither: no shirt-number column, and 150x150 mugshots
rather than the transparent full-body cutouts a squad page wants. The club
publishes both on its first-team pages, so this copies each cutout into the
same Supabase bucket the headshots use and writes the numbers out as
lib/squad-portraits.ts.

    python sync_squad_portraits.py            mirror anything missing
    python sync_squad_portraits.py --dry-run  report what's missing
    python sync_squad_portraits.py --force    re-fetch everything (new SIZE)

Re-run after a transfer window; a player it can't match keeps the Sofascore
headshot, so a miss degrades rather than breaks.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from sync_images import BUCKET, _env, _request, ensure_bucket, existing

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "lib" / "squad-portraits.ts"
SQUAD_URL = "https://www.fcbarcelona.com/en/football/first-team/players"
TEAM = "FC Barcelona"
PREFIX = "squad/"
# 4:5 just under 2x the 268px card. The club's resizer crops to the box it is
# given, which is what turns a 16:9 cutout into a portrait without any local
# tooling. Transparent PNG has no cheap codec here, so every pixel costs
# bytes, decode and raster on a page showing 22 of them at once — hence the
# smallest box that still looks sharp rather than the largest that fits.
SIZE = "?width=480&height=600"
# Colour suffixes mark the square studio card, not the cutout we want.
KIT = re.compile(r"-(blue|red|blau|grana)\b", re.I)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", s.lower())


def fetch(url: str) -> str:
    _, raw = _request(url)
    return raw.decode("utf-8", "replace")


def club_squad() -> list[dict]:
    """number, name, position, player-page URL and card image per player."""
    html = fetch(SQUAD_URL)
    out = []
    for block in html.split("team-list__person-container")[1:]:
        def one(pattern: str) -> str:
            m = re.search(pattern, block, re.S)
            return m.group(1).strip() if m else ""

        pos = one(r"team-person__position-meta[^>]*>(.*?)<")
        if pos == "Coach":
            continue
        out.append({
            "num": one(r"team-person__number[^>]*>(.*?)<"),
            "first": one(r"team-person__first-name[^>]*>(.*?)<"),
            "last": one(r"team-person__last-name[^>]*>(.*?)<"),
            "card": one(r'data-img-src="([^"]+)"'),
            "href": one(r'href="(https://www\.fcbarcelona\.com/en/football/'
                        r'first-team/players/[^"]+)"'),
        })
    return out


def cutout_urls(player: dict) -> list[str]:
    """Candidate cutout PNGs on a player's own page, best guess first.

    Filenames only hint at which asset is the transparent one, and they hint
    badly: the club names some by first name ("10-Lamine.png" for Yamal) and
    Xavi Espart's opaque studio card is itself a .png. So rank loosely, and
    let the caller check each candidate's alpha before accepting it.
    """
    if not player["href"]:
        return []
    html = fetch(player["href"])
    pngs = list(dict.fromkeys(re.findall(
        r"https://www\.fcbarcelona\.com/photo-resources/[^\"'\s,?]+\.png", html
    )))
    card_stem = Path(player["card"]).stem if player["card"] else ""
    # "10-Lamine-BLUE" -> "10-Lamine": the cutout usually shares this stem.
    base_stem = norm(KIT.sub("", card_stem))
    names = {norm(w) for w in
             (player["first"].split() + player["last"].split()) if w}

    ranked: list[tuple[int, str]] = []
    for url in pngs:
        stem = Path(url).stem
        n = norm(stem)
        if "transp" in stem.lower():
            rank = 0                              # the club says so outright
        elif base_stem and n == base_stem:
            rank = 1                              # the card's own stem
        elif any(name and name in n for name in names):
            rank = 2                              # some part of his name
        elif n == norm(card_stem):
            rank = 3                              # the square card itself
        else:
            continue                              # crests, stadium shots
        ranked.append((rank, url))
    return [url for _, url in sorted(ranked, key=lambda r: r[0])]


def is_cutout(blob: bytes) -> bool:
    """True when the image actually has a transparent background.

    A studio card with a solid backdrop reads as a player pasted on a red
    rectangle once it lands in a dark card, so reject anything that is
    effectively fully opaque.
    """
    if not shutil.which("ffmpeg"):
        return True
    with tempfile.TemporaryDirectory() as tmp:
        f = Path(tmp) / "c.png"
        f.write_bytes(blob)
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(f), "-vf", "alphaextract",
             "-f", "rawvideo", "-pix_fmt", "gray", "-"],
            capture_output=True,
        ).stdout
    return bool(raw) and raw.count(0) / len(raw) > 0.05


def alpha_box(path: Path, w: int, h: int, frac: float = 0.02):
    """Bounding box of the figure, from per-row and per-column alpha sums.

    A threshold on single pixels cannot separate the two things that need
    separating here: the faint halo baked into some cutouts, and genuinely
    soft edges like hair. Summing a whole row tells them apart — a halo row
    contributes almost nothing next to a row crossing a body — so the box
    keeps Joan Garcia's hair and drops Livakovic's glow, which no single
    cropdetect limit managed.
    """
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-vf", "alphaextract",
         "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        capture_output=True,
    ).stdout
    if len(raw) < w * h:
        return None
    rows = [sum(raw[y * w:(y + 1) * w]) for y in range(h)]
    cols = [0] * w
    for y in range(h):
        base = y * w
        for x in range(w):
            cols[x] += raw[base + x]

    def span(v: list[int]) -> tuple[int, int]:
        limit = max(v) * frac
        hits = [i for i, n in enumerate(v) if n > limit]
        return (hits[0], hits[-1]) if hits else (0, len(v) - 1)

    y0, y1 = span(rows)
    x0, x1 = span(cols)
    return x0, y0, x1 - x0 + 1, y1 - y0 + 1


def refit(blob: bytes) -> bytes:
    """Trim a cutout's transparent margin and refill the 4:5 box.

    The club frames these inconsistently — some figures run edge to edge,
    others sit inside a margin — so pasted in as-is a player can look
    shrunken, or low in the card, next to his team-mates. Trim to the
    figure, scale it to the box and bottom-align, and every card shows a
    body at the same scale.

    Needs ffmpeg; without it the cutout is used untouched, which is only a
    cosmetic loss.
    """
    if not shutil.which("ffmpeg"):
        return blob
    w, h = (int(v) for v in SIZE.split("width=")[1].split("&height="))
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.png"
        dst = Path(tmp) / "out.png"
        src.write_bytes(blob)
        box = alpha_box(src, w, h)
        if not box:
            return blob
        # A hair of headroom so the figure doesn't read as jammed against
        # the top of the card.
        chain = (f"crop={box[2]}:{box[3]}:{box[0]}:{box[1]},"
                 f"scale=w={w}:h={int(h * 0.96)}:"
                 f"force_original_aspect_ratio=decrease,"
                 f"pad={w}:{h}:(ow-iw)/2:(oh-ih):color=#00000000,format=rgba")
        out = subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
             "-i", str(src), "-vf", chain, str(dst)],
            capture_output=True,
        )
        return dst.read_bytes() if out.returncode == 0 and dst.exists() else blob


def our_players(base: str, key: str) -> dict[str, str]:
    """normalised name -> slug, for the club's players we hold stats on.

    Read from the database rather than data/processed: the CSVs are a
    snapshot of the last local rebuild and can trail a signing by weeks.
    """
    _, raw = _request(
        f"{base}/rest/v1/players?select=player,slug&team=eq.{urllib.parse.quote(TEAM)}",
        headers={"Authorization": f"Bearer {key}", "apikey": key},
    )
    return {norm(r["player"]): r["slug"] for r in json.loads(raw) if r.get("slug")}


def match(player: dict, ours: dict[str, str]) -> str | None:
    slug = ours.get(norm(f"{player['first']} {player['last']}"))
    if slug:
        return slug
    # Mononyms ("Pedri") and long formal names ("Hamza Mohamed ... Selim")
    # only ever agree on the surname.
    surname = norm(player["last"])
    hits = {s for k, s in ours.items() if k.endswith(surname) or surname.endswith(k)}
    return hits.pop() if len(hits) == 1 else None


def write_map(rows: dict[str, dict]) -> None:
    # The bucket path never changes, so a refreshed cutout would otherwise
    # keep serving from Next's optimizer cache and any CDN in front of it.
    # Stamping the run busts both without touching either cache by hand.
    stamp = int(time.time())
    lines = [
        "/**",
        " * Shirt numbers and squad cutouts, mirrored from the club's own",
        " * first-team pages by sync_squad_portraits.py. Generated — edit that",
        " * script, not this file. A player missing here falls back to the",
        " * Sofascore headshot.",
        " */",
        "export type Portrait = { n: number | null; src: string }",
        "",
        "export const SQUAD_PORTRAITS: Record<string, Portrait> = {",
    ]
    for slug, v in sorted(rows.items(), key=lambda kv: (kv[1]["n"] is None, kv[1]["n"] or 0)):
        n = v["n"] if v["n"] is not None else "null"
        lines.append(f'  "{slug}": {{ n: {n}, src: "{v["src"]}?v={stamp}" }},')
    lines += ["}", ""]
    OUT.write_text("\n".join(lines))


def sync(dry: bool = False, force: bool = False) -> None:
    base, key = _env()
    ensure_bucket(base, key)
    have = existing(base, key, PREFIX)
    ours = our_players(base, key)
    squad = club_squad()
    print(f"  club lists {len(squad)} players, we hold {len(ours)}")

    hdr = {"Authorization": f"Bearer {key}", "apikey": key,
           "Content-Type": "image/png", "x-upsert": "true"}
    rows: dict[str, dict] = {}
    missed, uploaded = [], 0

    for p in squad:
        slug = match(p, ours)
        if not slug:
            missed.append(f"{p['first']} {p['last']}".strip())
            continue
        num = int(p["num"]) if p["num"].strip().isdigit() else None
        rows[slug] = {"n": num, "src": f"{PREFIX}{slug}.png"}
        if dry or (f"{PREFIX}{slug}.png" in have and not force):
            continue
        try:
            blob = None
            for url in cutout_urls(p):
                _, candidate = _request(url + SIZE)
                if is_cutout(candidate):
                    blob = candidate
                    break
            if blob is None:
                print(f"    {slug}: no transparent cutout on the club page")
                rows.pop(slug)
                continue
            _request(f"{base}/storage/v1/object/{BUCKET}/{PREFIX}{slug}.png",
                     method="POST", data=refit(blob), headers=hdr)
        except urllib.error.HTTPError as e:
            # One flaky image must not end the run: the club CDN 500s now and
            # then. Keep whatever is already mirrored and move on.
            print(f"    {slug}: HTTP {e.code}, keeping existing copy")
            if f"{PREFIX}{slug}.png" not in have:
                rows.pop(slug)
            continue
        uploaded += 1
        time.sleep(0.3)

    if not dry:
        write_map(rows)
    print(f"  mirrored {uploaded} cutouts, mapped {len(rows)} players")
    if missed:
        print(f"  no stats row for: {', '.join(missed)}")


if __name__ == "__main__":
    sync(dry="--dry-run" in sys.argv, force="--force" in sys.argv)
