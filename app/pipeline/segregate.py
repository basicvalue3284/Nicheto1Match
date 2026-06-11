"""Segregate titles into 4 buckets using the rules locked in 00_Config.

Rules (in order):
1. How-To (Start)    — title begins with "how to" (case-insensitive)
2. How-To (Shorts)   — title contains MORE THAN 2 "#" tags (i.e., 3+)
3. How-To (Board)    — "how to" appears anywhere but the start
4. Non How-To        — none of the above

Skip is reserved for blank/duplicate rows handled upstream by the parser.
"""
from __future__ import annotations
import re
from dataclasses import dataclass
from typing import List

HASHTAG_RE = re.compile(r"#\w+")
HOW_TO_RE = re.compile(r"\bhow\s+to\b", re.IGNORECASE)
STARTS_HOW_TO_RE = re.compile(r"^\s*how\s+to\b", re.IGNORECASE)

TYPE_HOW_TO_START = "How-To (Start)"
TYPE_HOW_TO_BOARD = "How-To (Board)"
TYPE_HOW_TO_SHORTS = "How-To (Shorts)"
TYPE_NON_HOW_TO = "Non How-To"


@dataclass
class SegregatedTitle:
    index: int
    title: str
    type: str
    hashtag_count: int

    def as_dict(self) -> dict:
        return {
            "index": self.index,
            "title": self.title,
            "type": self.type,
            "hashtag_count": self.hashtag_count,
        }


def classify(title: str) -> tuple[str, int]:
    """Return (type, hashtag_count) for a single title."""
    hashtag_count = len(HASHTAG_RE.findall(title))
    if hashtag_count > 2:  # strictly more than 2 hashtags = Shorts
        return TYPE_HOW_TO_SHORTS, hashtag_count
    if STARTS_HOW_TO_RE.search(title):
        return TYPE_HOW_TO_START, hashtag_count
    if HOW_TO_RE.search(title):
        return TYPE_HOW_TO_BOARD, hashtag_count
    return TYPE_NON_HOW_TO, hashtag_count


def segregate(titles: List[str]) -> List[SegregatedTitle]:
    out: List[SegregatedTitle] = []
    for i, title in enumerate(titles, start=1):
        t, hc = classify(title)
        out.append(SegregatedTitle(index=i, title=title, type=t, hashtag_count=hc))
    return out


def summarize(results: List[SegregatedTitle]) -> dict:
    counts = {
        TYPE_HOW_TO_START: 0,
        TYPE_HOW_TO_BOARD: 0,
        TYPE_HOW_TO_SHORTS: 0,
        TYPE_NON_HOW_TO: 0,
    }
    for r in results:
        counts[r.type] = counts.get(r.type, 0) + 1
    return {
        "total": len(results),
        "by_type": counts,
    }
