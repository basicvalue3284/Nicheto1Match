"""Small JSON-backed job store.

This is deliberately simple for the first build: every job is one JSON file.
That gives us refresh/restart survival locally and maps cleanly to Firestore
later without changing the UI flow.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from app.pipeline.segregate import SegregatedTitle, TYPE_HOW_TO_SHORTS, TYPE_NON_HOW_TO, summarize

DATA_ROOT = Path(os.getenv("DATA_ROOT") or ("/tmp/nicheto1match/data" if os.getenv("VERCEL") else "data"))
DATA_DIR = DATA_ROOT / "jobs"


def utc_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


@dataclass
class TitleRow:
    index: int
    original_title: str
    type: str
    hashtag_count: int
    cleaned_title: str = ""
    removed_words: list[str] = field(default_factory=list)
    confidence: str = ""
    status: str = "PENDING"
    decision: str = ""
    reason: str = ""
    error: str = ""
    include_final: bool = False


@dataclass
class Job:
    id: str
    niche: str
    created_at: str
    updated_at: str
    state: str
    total: int
    processed: int
    failed: int
    batch_size: int
    model: str
    summary: dict[str, Any]
    cleaning_examples: list[dict[str, str]]
    policy_examples: list[dict[str, str]]
    policy_prompt: str
    rows: list[TitleRow]
    provider: str = "openai"
    raw_count: int = 0
    duplicate_count: int = 0
    auto_export: bool = False
    logs: list[str] = field(default_factory=list)
    message: str = ""

    @property
    def safe_count(self) -> int:
        return sum(1 for row in self.rows if row.status == "SAFE")

    @property
    def risky_count(self) -> int:
        return sum(1 for row in self.rows if row.status == "RISKY")

    @property
    def prohibited_count(self) -> int:
        return sum(1 for row in self.rows if row.status == "PROHIBITED")

    @property
    def pending_count(self) -> int:
        return sum(1 for row in self.rows if row.include_final and row.status == "PENDING")

    @property
    def final_count(self) -> int:
        return sum(1 for row in self.rows if row.include_final)

    @property
    def extracted_count(self) -> int:
        return sum(1 for row in self.rows if row.include_final and bool(row.cleaned_title))

    @property
    def policy_checked_count(self) -> int:
        return sum(1 for row in self.rows if row.include_final and row.status in {"SAFE", "RISKY", "PROHIBITED"})

    @property
    def ready_count(self) -> int:
        return sum(1 for row in self.rows if row.include_final and row.decision == "DO" and bool(row.cleaned_title))

    @property
    def review_count(self) -> int:
        return sum(1 for row in self.rows if row.include_final and row.status in {"RISKY", "ERROR"})

    @property
    def progress_pct(self) -> int:
        target = self.final_count
        if target == 0:
            return 0
        return int((self.processed / target) * 100)

    @property
    def export_blockers(self) -> list[str]:
        blockers = []
        if self.final_count == 0:
            blockers.append("No final titles selected.")
        if self.pending_count > 0:
            blockers.append(f"{self.pending_count} final title(s) are still pending.")
        if self.failed > 0:
            blockers.append(f"{self.failed} final title(s) have errors.")
        if self.ready_count == 0:
            blockers.append("No SAFE / DO titles are ready to export.")
        return blockers


def make_rows(results: list[SegregatedTitle]) -> list[TitleRow]:
    return [
        TitleRow(
            index=item.index,
            original_title=item.title,
            type=item.type,
            hashtag_count=item.hashtag_count,
            include_final=item.type not in {TYPE_NON_HOW_TO, TYPE_HOW_TO_SHORTS},
        )
        for item in results
    ]


def save_job(job: Job) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    job.updated_at = utc_now()
    path = DATA_DIR / f"{job.id}.json"
    path.write_text(json.dumps(_job_to_dict(job), ensure_ascii=False, indent=2), encoding="utf-8")


def append_log(job: Job, message: str) -> None:
    job.logs.append(f"{utc_now()} - {message}")
    job.logs = job.logs[-200:]


def load_job(job_id: str) -> Job | None:
    path = DATA_DIR / f"{job_id}.json"
    if not path.exists():
        return None
    return _job_from_dict(json.loads(path.read_text(encoding="utf-8")))


def list_jobs(limit: int = 8) -> list[Job]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    jobs = []
    for path in sorted(DATA_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        job = load_job(path.stem)
        if job:
            jobs.append(job)
        if len(jobs) >= limit:
            break
    return jobs


def refresh_counts(job: Job) -> None:
    job.processed = sum(1 for row in job.rows if row.include_final and row.status != "PENDING")
    job.failed = sum(1 for row in job.rows if row.status == "ERROR")
    job.summary = summarize([
        SegregatedTitle(
            index=row.index,
            title=row.original_title,
            type=row.type,
            hashtag_count=row.hashtag_count,
        )
        for row in job.rows
    ])


def _job_to_dict(job: Job) -> dict[str, Any]:
    data = asdict(job)
    data["safe_count"] = job.safe_count
    data["risky_count"] = job.risky_count
    data["prohibited_count"] = job.prohibited_count
    data["pending_count"] = job.pending_count
    data["final_count"] = job.final_count
    data["extracted_count"] = job.extracted_count
    data["policy_checked_count"] = job.policy_checked_count
    data["ready_count"] = job.ready_count
    data["review_count"] = job.review_count
    data["progress_pct"] = job.progress_pct
    return data


def _job_from_dict(data: dict[str, Any]) -> Job:
    rows = [TitleRow(**row) for row in data.get("rows", [])]
    keep = {
        "id",
        "niche",
        "created_at",
        "updated_at",
        "state",
        "total",
        "processed",
        "failed",
        "batch_size",
        "model",
        "provider",
        "summary",
        "cleaning_examples",
        "policy_examples",
        "policy_prompt",
        "raw_count",
        "duplicate_count",
        "auto_export",
        "logs",
        "message",
    }
    job_data = {key: value for key, value in data.items() if key in keep}
    job_data.setdefault("provider", "openai")
    job_data.setdefault("raw_count", job_data.get("total", len(rows)))
    job_data.setdefault("duplicate_count", max(job_data.get("raw_count", len(rows)) - len(rows), 0))
    job_data.setdefault("auto_export", False)
    job_data.setdefault("logs", [])
    return Job(rows=rows, **job_data)
