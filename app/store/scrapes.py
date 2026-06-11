"""JSON store for Phase 2 title scraping jobs."""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from app.store.jobs import utc_now

DATA_ROOT = Path(os.getenv("DATA_ROOT") or ("/tmp/nicheto1match/data" if os.getenv("VERCEL") else "data"))
DATA_DIR = DATA_ROOT / "scrapes"


@dataclass
class ScrapeResult:
    index: int
    input_title: str
    result_title: str = ""
    views: str = ""
    channel_id: str = ""
    channel_title: str = ""
    subs: str = "Pending..."
    search_position: int = 0
    match_count: int = 0
    match_count_top5: int = 0
    match_count_top10: int = 0
    match_count_top15: int = 0
    match_tier: str = ""
    subscriber_score: str = ""
    opportunity_priority: str = ""
    status_tagging: str = "Pending"
    matched_result: bool = False
    error: str = ""


@dataclass
class ScrapeJob:
    id: str
    name: str
    created_at: str
    updated_at: str
    state: str
    titles: list[str]
    results: list[ScrapeResult] = field(default_factory=list)
    processed: int = 0
    failed: int = 0
    source_phase1_job_id: str = ""
    logs: list[str] = field(default_factory=list)
    message: str = ""

    @property
    def total(self) -> int:
        return len(self.titles)

    @property
    def progress_pct(self) -> int:
        if not self.total:
            return 0
        return min(100, int((self.processed / self.total) * 100))

    @property
    def one_match_count(self) -> int:
        return len({row.input_title for row in self.results if row.match_count == 1 and row.matched_result})

    @property
    def two_match_count(self) -> int:
        return len({row.input_title for row in self.results if row.match_count == 2})

    @property
    def three_match_count(self) -> int:
        return len({row.input_title for row in self.results if row.match_count == 3})

    @property
    def saturation_count(self) -> int:
        return len({row.input_title for row in self.results if row.match_count > 3})

    @property
    def no_match_count(self) -> int:
        return len({row.input_title for row in self.results if row.match_count == 0})


def append_scrape_log(job: ScrapeJob, message: str) -> None:
    job.logs.append(f"{utc_now()} - {message}")
    job.logs = job.logs[-200:]


def save_scrape_job(job: ScrapeJob) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    job.updated_at = utc_now()
    path = DATA_DIR / f"{job.id}.json"
    path.write_text(json.dumps(_scrape_to_dict(job), ensure_ascii=False, indent=2), encoding="utf-8")


def load_scrape_job(job_id: str) -> ScrapeJob | None:
    path = DATA_DIR / f"{job_id}.json"
    if not path.exists():
        return None
    return _scrape_from_dict(json.loads(path.read_text(encoding="utf-8")))


def list_scrape_jobs(limit: int = 8) -> list[ScrapeJob]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    jobs: list[ScrapeJob] = []
    for path in sorted(DATA_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        job = load_scrape_job(path.stem)
        if job:
            jobs.append(job)
        if len(jobs) >= limit:
            break
    return jobs


def _scrape_to_dict(job: ScrapeJob) -> dict[str, Any]:
    data = asdict(job)
    data["total"] = job.total
    data["progress_pct"] = job.progress_pct
    data["one_match_count"] = job.one_match_count
    data["two_match_count"] = job.two_match_count
    data["three_match_count"] = job.three_match_count
    data["saturation_count"] = job.saturation_count
    data["no_match_count"] = job.no_match_count
    return data


def _scrape_from_dict(data: dict[str, Any]) -> ScrapeJob:
    results = []
    for row in data.get("results", []):
        row.setdefault("matched_result", False)
        row.setdefault("search_position", 0)
        row.setdefault("match_count_top5", row.get("match_count", 0))
        row.setdefault("match_count_top10", row.get("match_count", 0))
        row.setdefault("match_count_top15", row.get("match_count", 0))
        row.setdefault("match_tier", "")
        row.setdefault("subscriber_score", "")
        row.setdefault("opportunity_priority", "")
        results.append(ScrapeResult(**row))
    keep = {
        "id",
        "name",
        "created_at",
        "updated_at",
        "state",
        "titles",
        "processed",
        "failed",
        "source_phase1_job_id",
        "logs",
        "message",
    }
    job_data = {key: value for key, value in data.items() if key in keep}
    job_data.setdefault("source_phase1_job_id", "")
    job_data.setdefault("logs", [])
    job_data.setdefault("message", "")
    return ScrapeJob(results=results, **job_data)
