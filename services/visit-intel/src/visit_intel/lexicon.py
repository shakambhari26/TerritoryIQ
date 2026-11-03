"""Bengali / Hindi / English trade-slang matcher.

Usage:
    from visit_intel.lexicon import Lexicon
    lex = Lexicon.load()
    lex.tag("Rajmistri bollo dam beshi, Shyam sosta dicche")
    # -> [Match(term_id='L020', maps_to='MASON', ...), Match('L002', 'COMPETITOR_PRICE'), ...]

Run as a script to tag the processed dataset:  python -m visit_intel.lexicon
"""
import csv
import re
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEXICON_CSV = ROOT / "lexicon/slang_lexicon.csv"


@dataclass(frozen=True)
class Match:
    term_id: str
    canonical: str
    matched: str
    maps_to: str
    map_type: str
    review_status: str


class Lexicon:
    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.rows_by_id = {r["term_id"]: r for r in rows}
        patterns = []
        for row in rows:
            surface = [v.strip() for v in row["variants"].split("|") if v.strip()]
            surface += [s.strip() for s in row["native_script"].split("/") if s.strip()]
            for s in surface:
                patterns.append((row, s))
        # Longest first so "dam beshi" wins over "dam".
        patterns.sort(key=lambda p: -len(p[1]))
        self._regex = re.compile("|".join(_boundary(s) for _, s in patterns), re.IGNORECASE)
        self._by_surface = {s.lower(): row for row, s in patterns}

    @classmethod
    def load(cls, path: Path = LEXICON_CSV) -> "Lexicon":
        with open(path, encoding="utf-8") as f:
            return cls(list(csv.DictReader(f)))

    def tag(self, text: str) -> list[Match]:
        found = []
        for m in self._regex.finditer(text or ""):
            row = self._by_surface[m.group(0).lower()]
            found.append(Match(row["term_id"], row["canonical"], m.group(0), row["maps_to"],
                               row["map_type"], row["review_status"]))
        return found

    def summary(self, text: str) -> dict:
        """Flat features for the model: segments hinted, flags raised, competitors named."""
        matches = self.tag(text)
        return {
            "lex_segments": sorted({m.maps_to for m in matches if m.map_type == "segment"}),
            "lex_flags": sorted({m.maps_to for m in matches if m.map_type == "flag"}),
            "lex_competitors": sorted({m.maps_to.split(":")[1] for m in matches if m.maps_to.startswith("COMPETITOR:")}),
            "lex_ambiguous": sorted({m.canonical for m in matches if m.review_status == "ambiguous"}),
        }


def _boundary(surface: str) -> str:
    escaped = re.escape(surface)
    # Latin terms need word boundaries ("dam" must not match "damage"); Indic scripts do not use \b reliably.
    return rf"(?<![A-Za-z]){escaped}(?![A-Za-z])" if surface.isascii() else escaped


if __name__ == "__main__":
    import pandas as pd

    lex = Lexicon.load()
    df = pd.read_csv(ROOT / "data/processed/visits_dataset.csv")
    for _, row in df.iterrows():
        s = lex.summary(row["transcript"])
        if any(s.values()):
            print(row["visit_id"], {k: v for k, v in s.items() if v})
    demo = "Rajmistri bollo dam beshi, Shyam sosta dicche. Chhad dhalai porer shoptahe, 3 MT lagbe. Baki taka kal debe."
    print("\nDemo (Bengali-English mix):", demo)
    print(lex.summary(demo))
