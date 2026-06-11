"""Niche Pipeline — FastAPI application."""
from __future__ import annotations
import io
import os
import secrets
import uuid
import csv
import json
import html
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, Request, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.responses import HTMLResponse, StreamingResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from dotenv import load_dotenv

from app.pipeline.defaults import CLEANING_EXAMPLES, POLICY_EXAMPLES, POLICY_PROMPT
from app.pipeline.parser import parse_upload, parse_text
from app.pipeline.processor import _normalize_extracted_title, parse_extra_cleaning_examples, process_job
from app.pipeline.segregate import SegregatedTitle, segregate, summarize
from app.pipeline.title_scraper import fetch_one_match_subs, run_bulk_scrape
from app.store.jobs import Job, append_log, list_jobs, load_job, make_rows, refresh_counts, save_job, utc_now
from app.store.scrapes import ScrapeJob, append_scrape_log, list_scrape_jobs, load_scrape_job, save_scrape_job
from app.store.settings import get_gemini_key, get_openai_key, get_rapidapi_key, save_setting

load_dotenv()

# ─── Configuration ───────────────────────────────────────────────────────────
APP_USER = os.getenv("APP_USER", "admin")
APP_PASS = os.getenv("APP_PASS", "changeme")
APP_VERSION = "v0.5 — reliable automation"
DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
DEFAULT_PROVIDER = os.getenv("AI_PROVIDER", "openai")
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
DEFAULT_BATCH_SIZE = int(os.getenv("BATCH_SIZE", "25"))

# ─── App + templates ─────────────────────────────────────────────────────────
app = FastAPI(title="Niche Pipeline", version=APP_VERSION)
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# ─── Auth ────────────────────────────────────────────────────────────────────
security = HTTPBasic()


def authenticate(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    correct_user = secrets.compare_digest(credentials.username, APP_USER)
    correct_pass = secrets.compare_digest(credentials.password, APP_PASS)
    if not (correct_user and correct_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


# ─── Routes ──────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def home(request: Request, user: str = Depends(authenticate)):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "version": APP_VERSION,
        "user": user,
        "recent_jobs": list_jobs(),
        "default_model": DEFAULT_MODEL,
        "default_provider": DEFAULT_PROVIDER,
        "default_gemini_model": DEFAULT_GEMINI_MODEL,
        "default_batch_size": DEFAULT_BATCH_SIZE,
        "has_server_key": bool(os.getenv("OPENAI_API_KEY") or get_openai_key()),
        "has_gemini_key": bool(os.getenv("GEMINI_API_KEY") or get_gemini_key()),
        "cleaning_examples": CLEANING_EXAMPLES,
        "policy_prompt": POLICY_PROMPT,
        "recent_scrapes": list_scrape_jobs(),
        "has_rapidapi_key": bool(os.getenv("RAPIDAPI_KEY") or get_rapidapi_key()),
    })


@app.post("/jobs", response_class=HTMLResponse)
async def create_job(
    request: Request,
    background_tasks: BackgroundTasks,
    niche: str = Form(""),
    pasted: str = Form(""),
    provider: str = Form(DEFAULT_PROVIDER),
    model: str = Form(DEFAULT_MODEL),
    batch_size: int = Form(DEFAULT_BATCH_SIZE),
    run_now: str = Form("no"),
    one_time_openai_key: str = Form(""),
    one_time_gemini_key: str = Form(""),
    auto_export: str = Form("yes"),
    selected_payload: str = Form(""),
    phase_mode: str = Form("auto"),
    extra_cleaning_examples: str = Form(""),
    policy_prompt: str = Form(POLICY_PROMPT),
    file: Optional[UploadFile] = File(None),
    user: str = Depends(authenticate),
):
    # Collect titles from either source
    titles: list[str] = []
    raw_count = 0
    source_name = ""
    if file is not None and file.filename:
        source_name = Path(file.filename).stem.replace("_", " ").replace("-", " ").strip()
        content = await file.read()
        titles = parse_upload(file.filename, content)
        raw_count = len(titles)
    elif pasted.strip():
        raw_count = sum(1 for line in pasted.splitlines() if line.strip())
        titles = parse_text(pasted)
        source_name = titles[0][:64] if titles else ""
    else:
        raise HTTPException(status_code=400, detail="Provide a file or paste titles.")

    if not titles:
        raise HTTPException(status_code=400, detail="No titles found in input.")

    include_flags: list[bool] = []
    results = segregate(titles)
    if selected_payload.strip():
        try:
            payload = json.loads(selected_payload)
        except json.JSONDecodeError:
            payload = []
        if isinstance(payload, list):
            allowed_types = {"How-To (Start)", "How-To (Board)", "How-To (Shorts)", "Non How-To"}
            payload_results: list[SegregatedTitle] = []
            payload_flags: list[bool] = []
            for item in payload:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title") or "").strip()
                if not title:
                    continue
                row_type = str(item.get("type") or "").strip()
                if row_type not in allowed_types:
                    row_type = segregate([title])[0].type
                try:
                    hashtag_count = int(item.get("hashtag_count") or 0)
                except (TypeError, ValueError):
                    hashtag_count = 0
                payload_results.append(SegregatedTitle(
                    index=len(payload_results) + 1,
                    title=title,
                    type=row_type,
                    hashtag_count=hashtag_count,
                ))
                payload_flags.append(bool(item.get("include_final")))
            if payload_results:
                results = payload_results
                include_flags = payload_flags
                raw_count = len(payload_results)
    job_id = uuid.uuid4().hex[:10]
    cleaning_examples = CLEANING_EXAMPLES + parse_extra_cleaning_examples(extra_cleaning_examples)
    safe_batch_size = max(5, min(int(batch_size or DEFAULT_BATCH_SIZE), 50))
    clean_provider = (provider or DEFAULT_PROVIDER).strip().lower()
    if clean_provider not in {"openai", "gemini"}:
        clean_provider = "openai"
    selected_model = (model or (DEFAULT_GEMINI_MODEL if clean_provider == "gemini" else DEFAULT_MODEL)).strip()
    if one_time_openai_key.strip():
        save_setting("openai_key", one_time_openai_key.strip())
    if one_time_gemini_key.strip():
        save_setting("gemini_key", one_time_gemini_key.strip())
    rows = make_rows(results)
    if include_flags:
        for row, include in zip(rows, include_flags):
            row.include_final = include
    auto_mode = phase_mode == "auto"
    job = Job(
        id=job_id,
        niche=niche.strip() or source_name or "Unnamed niche",
        created_at=utc_now(),
        updated_at=utc_now(),
        state="QUEUED" if run_now == "yes" or auto_mode else "READY",
        total=len(results),
        processed=0,
        failed=0,
        batch_size=safe_batch_size,
        model=selected_model,
        provider=clean_provider,
        summary=summarize(results),
        cleaning_examples=cleaning_examples,
        policy_examples=POLICY_EXAMPLES,
        policy_prompt=policy_prompt.strip() or POLICY_PROMPT,
        rows=rows,
        raw_count=raw_count or len(results),
        duplicate_count=max((raw_count or len(results)) - len(results), 0),
        auto_export=auto_export.lower() in {"1", "true", "yes", "on"},
    )
    append_log(job, f"Created job with {job.raw_count} uploaded title(s), {job.duplicate_count} duplicate(s), {job.total} unique title(s).")
    save_job(job)
    if auto_mode:
        one_time_key = one_time_gemini_key.strip() if clean_provider == "gemini" else one_time_openai_key.strip()
        append_log(job, "Automated Phase 1: queued Step 2 extraction and policy check, then pause for review.")
        save_job(job)
        background_tasks.add_task(_run_full_automation, job_id, one_time_key or None, 95, True)
    elif run_now == "yes":
        one_time_key = one_time_gemini_key.strip() if clean_provider == "gemini" else one_time_openai_key.strip()
        background_tasks.add_task(process_job, job_id, one_time_key or None)
    return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)


@app.post("/preview-upload")
async def preview_upload(
    file: UploadFile = File(...),
    user: str = Depends(authenticate),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Provide a file.")
    content = await file.read()
    titles = parse_upload(file.filename, content)
    return {
        "filename": file.filename,
        "count": len(titles),
        "titles": titles[:5000],
    }


@app.post("/settings/api-keys")
async def save_api_keys(
    request: Request,
    one_time_openai_key: str = Form(""),
    one_time_gemini_key: str = Form(""),
    user: str = Depends(authenticate),
):
    if one_time_openai_key.strip():
        save_setting("openai_key", one_time_openai_key.strip())
    if one_time_gemini_key.strip():
        save_setting("gemini_key", one_time_gemini_key.strip())
    return RedirectResponse(url=request.headers.get("referer", "/"), status_code=303)


@app.post("/settings/all")
async def save_all_settings(
    request: Request,
    one_time_openai_key: str = Form(""),
    one_time_gemini_key: str = Form(""),
    rapidapi_key: str = Form(""),
    user: str = Depends(authenticate),
):
    if one_time_openai_key.strip():
        save_setting("openai_key", one_time_openai_key.strip())
    if one_time_gemini_key.strip():
        save_setting("gemini_key", one_time_gemini_key.strip())
    if rapidapi_key.strip():
        save_setting("rapidapi_key", rapidapi_key.strip())
    return RedirectResponse(url=request.headers.get("referer", "/"), status_code=303)


@app.get("/jobs/{job_id}", response_class=HTMLResponse)
async def view_job(request: Request, job_id: str, user: str = Depends(authenticate)):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    existing_scrape = next((scrape for scrape in list_scrape_jobs(1000) if scrape.source_phase1_job_id == job.id), None)
    return templates.TemplateResponse("job.html", {
        "request": request,
        "job": job,
        "existing_scrape": existing_scrape,
        "version": APP_VERSION,
        "user": user,
        "has_server_key": bool(os.getenv("OPENAI_API_KEY") or get_openai_key()),
        "has_gemini_key": bool(os.getenv("GEMINI_API_KEY") or get_gemini_key()),
        "has_rapidapi_key": bool(os.getenv("RAPIDAPI_KEY") or get_rapidapi_key()),
    })


@app.post("/jobs/{job_id}/run")
async def run_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    one_time_openai_key: str = Form(""),
    one_time_gemini_key: str = Form(""),
    run_mode: str = Form("full"),
    user: str = Depends(authenticate),
):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.state == "RUNNING":
        return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)
    one_time_key = one_time_gemini_key.strip() if getattr(job, "provider", "openai") == "gemini" else one_time_openai_key.strip()
    if one_time_openai_key.strip():
        save_setting("openai_key", one_time_openai_key.strip())
    if one_time_gemini_key.strip():
        save_setting("gemini_key", one_time_gemini_key.strip())
    key_env = "GEMINI_API_KEY" if getattr(job, "provider", "openai") == "gemini" else "OPENAI_API_KEY"
    saved_key = get_gemini_key() if getattr(job, "provider", "openai") == "gemini" else get_openai_key()
    if not (one_time_key or os.getenv(key_env, "") or saved_key):
        job.state = "READY"
        job.message = f"Add {key_env} before running Step 2."
        append_log(job, f"Run blocked: missing {key_env}.")
        save_job(job)
        return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)
    job.state = "QUEUED"
    job.message = "Queued for processing..."
    append_log(job, f"Queued run mode: {run_mode}.")
    save_job(job)
    background_tasks.add_task(
        process_job,
        job_id,
        one_time_key or None,
        run_mode == "retry_failed",
        run_mode == "retry_pending",
        25 if run_mode == "test_25" else None,
        run_mode == "reprocess_all",
    )
    return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)


def _upsert_scrape_from_phase1(job: Job, titles: list[str]) -> ScrapeJob:
    for existing in list_scrape_jobs(1000):
        if existing.source_phase1_job_id == job.id:
            existing.titles = titles
            existing.state = "QUEUED"
            existing.message = "Queued from Step 2..."
            append_scrape_log(existing, f"Updated from Phase 1 job {job.id} with {len(titles)} SAFE title(s).")
            save_scrape_job(existing)
            return existing
    scrape_id = uuid.uuid4().hex[:10]
    scrape = ScrapeJob(
        id=scrape_id,
        name=f"{job.niche} - Title Scraper",
        created_at=utc_now(),
        updated_at=utc_now(),
        state="QUEUED",
        message="Queued from Step 2...",
        titles=titles,
        source_phase1_job_id=job.id,
    )
    append_scrape_log(scrape, f"Created from Phase 1 job {job.id} with {len(titles)} SAFE title(s).")
    save_scrape_job(scrape)
    return scrape


async def _run_full_automation(job_id: str, api_key: str | None, threshold_pct: int = 95, pause_before_step3: bool = False) -> None:
    await process_job(job_id, api_key, reprocess_all=True)
    job = load_job(job_id)
    if not job:
        return
    refresh_counts(job)
    ready_rate = (job.ready_count / job.final_count * 100) if job.final_count else 0
    if ready_rate < threshold_pct:
        job.state = "NEEDS_REVIEW"
        job.message = f"Automation paused: {ready_rate:.0f}% ready, below {threshold_pct}% threshold. Review exceptions, then continue."
        append_log(job, job.message)
        save_job(job)
        return
    titles = [row.cleaned_title for row in job.rows if row.include_final and row.decision == "DO" and row.cleaned_title]
    if not titles:
        job.state = "NEEDS_REVIEW"
        job.message = "Automation paused: no SAFE extracted titles are ready for Title Scraper."
        append_log(job, job.message)
        save_job(job)
        return
    if pause_before_step3:
        job.state = "COMPLETED"
        job.message = f"Automation paused before Step 3. {len(titles)} SAFE title(s) are ready."
        append_log(job, job.message)
        save_job(job)
        return
    scrape = _upsert_scrape_from_phase1(job, titles)
    append_log(job, f"Automation continuing to Step 3 with {len(titles)} SAFE title(s).")
    save_job(job)
    await run_bulk_scrape(scrape.id, None)


@app.post("/jobs/{job_id}/automation")
async def run_full_automation(
    job_id: str,
    background_tasks: BackgroundTasks,
    one_time_openai_key: str = Form(""),
    one_time_gemini_key: str = Form(""),
    threshold_pct: int = Form(95),
    pause_before_step3: str = Form(""),
    user: str = Depends(authenticate),
):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.state == "RUNNING":
        return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)
    one_time_key = one_time_gemini_key.strip() if getattr(job, "provider", "openai") == "gemini" else one_time_openai_key.strip()
    if one_time_openai_key.strip():
        save_setting("openai_key", one_time_openai_key.strip())
    if one_time_gemini_key.strip():
        save_setting("gemini_key", one_time_gemini_key.strip())
    key_env = "GEMINI_API_KEY" if getattr(job, "provider", "openai") == "gemini" else "OPENAI_API_KEY"
    saved_key = get_gemini_key() if getattr(job, "provider", "openai") == "gemini" else get_openai_key()
    if not (one_time_key or os.getenv(key_env, "") or saved_key):
        job.state = "READY"
        job.message = f"Add {key_env} before running automation."
        append_log(job, f"Automation blocked: missing {key_env}.")
        save_job(job)
        return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)
    job.state = "QUEUED"
    job.message = f"Queued full automation with {threshold_pct}% review threshold..."
    append_log(job, job.message)
    save_job(job)
    pause = pause_before_step3.lower() in {"1", "true", "yes", "on"}
    background_tasks.add_task(_run_full_automation, job_id, one_time_key or None, threshold_pct, pause)
    return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)


@app.post("/jobs/{job_id}/start-scraper")
async def start_scraper_from_phase1(
    job_id: str,
    background_tasks: BackgroundTasks,
    user: str = Depends(authenticate),
):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    titles = [row.cleaned_title for row in job.rows if row.include_final and row.decision == "DO" and row.cleaned_title]
    if not titles:
        job.message = "No SAFE extracted titles are ready for Title Scraper."
        append_log(job, "Title Scraper blocked: no SAFE extracted titles.")
        save_job(job)
        return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)
    scrape = _upsert_scrape_from_phase1(job, titles)
    append_log(job, f"Sent {len(titles)} SAFE title(s) to Title Scraper job {scrape.id}.")
    save_job(job)
    background_tasks.add_task(run_bulk_scrape, scrape.id, None)
    return RedirectResponse(url=f"/scraper/jobs/{scrape.id}", status_code=303)


@app.post("/jobs/{job_id}/rows/bulk")
async def bulk_row_action(
    job_id: str,
    background_tasks: BackgroundTasks,
    action: str = Form(...),
    selected_rows: str = Form(""),
    one_time_openai_key: str = Form(""),
    one_time_gemini_key: str = Form(""),
    user: str = Depends(authenticate),
):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    indexes = {
        int(value)
        for value in selected_rows.split(",")
        if value.strip().isdigit()
    }
    if not indexes:
        job.message = "Select one or more rows first."
        save_job(job)
        return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)
    changed = 0
    if action in {"mark_safe", "move_step3"}:
        for row in job.rows:
            if row.index not in indexes:
                continue
            if not row.cleaned_title:
                cleaned, removed = _normalize_extracted_title(row.original_title)
                row.cleaned_title = cleaned
                row.removed_words = removed
            row.status = "SAFE"
            row.decision = "DO"
            row.reason = ""
            row.error = ""
            row.include_final = True
            changed += 1
        append_log(job, f"Bulk {action} applied to {changed} row(s).")
        refresh_counts(job)
        save_job(job)
        return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)
    if action == "regenerate":
        key_env = "GEMINI_API_KEY" if getattr(job, "provider", "openai") == "gemini" else "OPENAI_API_KEY"
        one_time_key = one_time_gemini_key.strip() if getattr(job, "provider", "openai") == "gemini" else one_time_openai_key.strip()
        if one_time_openai_key.strip():
            save_setting("openai_key", one_time_openai_key.strip())
        if one_time_gemini_key.strip():
            save_setting("gemini_key", one_time_gemini_key.strip())
        saved_key = get_gemini_key() if getattr(job, "provider", "openai") == "gemini" else get_openai_key()
        if not (one_time_key or os.getenv(key_env, "") or saved_key):
            job.message = f"Add {key_env} before regenerating rows."
            append_log(job, f"Bulk regenerate blocked: missing {key_env}.")
            save_job(job)
            return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)
        for row in job.rows:
            if row.index in indexes:
                row.status = "ERROR"
                row.error = "Queued for regeneration."
                row.include_final = True
                changed += 1
        refresh_counts(job)
        job.state = "QUEUED"
        job.message = f"Queued {changed} row(s) for regeneration..."
        append_log(job, job.message)
        save_job(job)
        background_tasks.add_task(process_job, job_id, one_time_key or None, True, False, None)
        return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)
    raise HTTPException(status_code=400, detail="Unsupported bulk action")


@app.post("/jobs/{job_id}/row")
async def update_row(
    job_id: str,
    row_index: int = Form(...),
    row_type: str = Form(""),
    manual_extraction: str = Form(""),
    manual_policy: str = Form(""),
    manual_ready: str = Form("false"),
    user: str = Depends(authenticate),
):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    allowed_types = {"How-To (Start)", "How-To (Board)", "How-To (Shorts)", "Non How-To"}
    for row in job.rows:
        if row.index == row_index:
            if row_type in allowed_types:
                row.type = row_type
                row.include_final = row_type not in {"Non How-To", "How-To (Shorts)"}
                append_log(job, f"Row {row.index} tag overridden to {row_type}.")
            if manual_extraction.strip() and manual_extraction.strip() != "(waiting...)":
                row.cleaned_title = manual_extraction.strip()
                row.removed_words = []
                row.status = "SAFE"
                row.decision = "DO"
                row.reason = ""
                row.error = ""
                row.include_final = True
                append_log(job, f"Row {row.index} extraction manually overridden.")
            if manual_policy in {"SAFE", "RISKY", "PROHIBITED", "ERROR", "PENDING"}:
                row.status = manual_policy
                row.decision = {
                    "SAFE": "DO",
                    "RISKY": "REWRITE",
                    "PROHIBITED": "AVOID",
                    "ERROR": "",
                    "PENDING": "",
                }[manual_policy]
                if manual_policy == "SAFE":
                    row.reason = ""
                    row.error = ""
                    row.include_final = True
                append_log(job, f"Row {row.index} policy overridden to {manual_policy}.")
            if manual_ready.lower() in {"1", "true", "yes", "on"}:
                if not row.cleaned_title:
                    cleaned, removed = _normalize_extracted_title(row.original_title)
                    row.cleaned_title = cleaned
                    row.removed_words = removed
                row.status = "SAFE"
                row.decision = "DO"
                row.reason = ""
                row.error = ""
                row.include_final = True
                append_log(job, f"Row {row.index} manually moved to Step 3.")
            refresh_counts(job)
            save_job(job)
            return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)
    raise HTTPException(status_code=404, detail="Row not found")


@app.post("/jobs/{job_id}/row/regenerate")
async def regenerate_row(
    job_id: str,
    background_tasks: BackgroundTasks,
    row_index: int = Form(...),
    one_time_openai_key: str = Form(""),
    one_time_gemini_key: str = Form(""),
    user: str = Depends(authenticate),
):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    key_env = "GEMINI_API_KEY" if getattr(job, "provider", "openai") == "gemini" else "OPENAI_API_KEY"
    one_time_key = one_time_gemini_key.strip() if getattr(job, "provider", "openai") == "gemini" else one_time_openai_key.strip()
    if one_time_openai_key.strip():
        save_setting("openai_key", one_time_openai_key.strip())
    if one_time_gemini_key.strip():
        save_setting("gemini_key", one_time_gemini_key.strip())
    saved_key = get_gemini_key() if getattr(job, "provider", "openai") == "gemini" else get_openai_key()
    if not (one_time_key or os.getenv(key_env, "") or saved_key):
        job.message = f"Add {key_env} before regenerating rows."
        append_log(job, f"Regenerate blocked: missing {key_env}.")
        save_job(job)
        return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)
    for row in job.rows:
        if row.index == row_index:
            row.status = "ERROR"
            row.error = "Queued for regeneration."
            row.include_final = True
            break
    else:
        raise HTTPException(status_code=404, detail="Row not found")
    refresh_counts(job)
    job.state = "QUEUED"
    job.message = f"Queued row {row_index} for regeneration..."
    append_log(job, f"Queued row {row_index} for regeneration.")
    save_job(job)
    background_tasks.add_task(process_job, job_id, one_time_key or None, True, False, None)
    return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)


@app.post("/jobs/{job_id}/selection")
async def update_selection(
    job_id: str,
    row_index: int = Form(...),
    include_final: str = Form("false"),
    user: str = Depends(authenticate),
):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    desired = include_final.lower() in {"1", "true", "yes", "on"}
    for row in job.rows:
        if row.index == row_index:
            row.include_final = desired
            if desired and row.status not in {"SAFE", "RISKY", "PROHIBITED", "ERROR"}:
                row.status = "PENDING"
            refresh_counts(job)
            append_log(job, f"Row {row.index} final selection set to {row.include_final}.")
            save_job(job)
            return {
                "ok": True,
                "row_index": row.index,
                "include_final": row.include_final,
                "final_count": job.final_count,
            }
    raise HTTPException(status_code=404, detail="Row not found")


@app.post("/jobs/{job_id}/selection/bulk")
async def bulk_selection(
    job_id: str,
    action: str = Form(...),
    user: str = Depends(authenticate),
):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    for row in job.rows:
        if action == "select_all":
            row.include_final = True
        elif action == "clear_all":
            row.include_final = False
        elif action == "select_how_to":
            row.include_final = row.type not in {"Non How-To", "How-To (Shorts)"}
    refresh_counts(job)
    append_log(job, f"Bulk selection action applied: {action}.")
    save_job(job)
    return RedirectResponse(url=f"/jobs/{job_id}", status_code=303)


@app.get("/jobs/{job_id}/status")
async def job_status(job_id: str, user: str = Depends(authenticate)):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    refresh_counts(job)
    return JSONResponse({
        "id": job.id,
        "state": job.state,
        "message": job.message,
        "total": job.total,
        "raw_count": job.raw_count,
        "duplicate_count": job.duplicate_count,
        "final_count": job.final_count,
        "extracted_count": job.extracted_count,
        "policy_checked_count": job.policy_checked_count,
        "ready_count": job.ready_count,
        "review_count": job.review_count,
        "processed": job.processed,
        "failed": job.failed,
        "progress_pct": job.progress_pct,
        "safe_count": job.safe_count,
        "risky_count": job.risky_count,
        "prohibited_count": job.prohibited_count,
        "pending_count": job.pending_count,
        "export_blockers": job.export_blockers,
        "logs": job.logs[-20:],
    })


@app.get("/jobs/{job_id}/validate")
async def validate_job(job_id: str, user: str = Depends(authenticate)):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    refresh_counts(job)
    return {
        "ok": not job.export_blockers,
        "blockers": job.export_blockers,
        "ready_count": job.ready_count,
        "pending_count": job.pending_count,
        "failed": job.failed,
    }


@app.get("/jobs/{job_id}/download")
async def download_job(job_id: str, kind: str = "master", user: str = Depends(authenticate)):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    safe_niche = job.niche.replace(" ", "_")
    if kind == "master":
        headers = ["#", "Original Title", "Title Extraction", "Removed Text", "Tag", "Policy", "Reason Notes", "Confidence", "Error"]

        def row_values(row, out_index: int) -> list[str]:
            return [
                str(out_index),
                row.original_title,
                row.cleaned_title,
                "; ".join(row.removed_words),
                row.type,
                row.status,
                row.reason,
                str(row.confidence),
                row.error,
            ]

        def sheet_rows(rows) -> list[list[str]]:
            return [headers] + [row_values(row, idx) for idx, row in enumerate(rows, start=1)]

        def cell(value: str) -> str:
            return f'<Cell><Data ss:Type="String">{html.escape(str(value or ""))}</Data></Cell>'

        def worksheet(name: str, rows: list[list[str]]) -> str:
            safe_name = html.escape(name[:31])
            rendered_rows = "".join(f"<Row>{''.join(cell(value) for value in row)}</Row>" for row in rows)
            return f'<Worksheet ss:Name="{safe_name}"><Table>{rendered_rows}</Table></Worksheet>'

        groups = [
            ("Raw Data", job.rows),
            ("How-To", [row for row in job.rows if row.type != "Non How-To"]),
            ("How-To (Start)", [row for row in job.rows if row.type == "How-To (Start)"]),
            ("How-To (Board)", [row for row in job.rows if row.type == "How-To (Board)"]),
            ("How-To (Shorts)", [row for row in job.rows if row.type == "How-To (Shorts)"]),
            ("Non How-To", [row for row in job.rows if row.type == "Non How-To"]),
            ("Final List", [row for row in job.rows if row.include_final]),
        ]
        xml = """<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
""" + "".join(worksheet(name, sheet_rows(rows)) for name, rows in groups) + "</Workbook>"
        return StreamingResponse(
            iter([xml]),
            media_type="application/vnd.ms-excel",
            headers={"Content-Disposition": f'attachment; filename="master_{safe_niche}_{job.id}.xls"'},
        )
    buf = io.StringIO()
    writer = csv.writer(buf)
    if kind in {"ready", "partial"}:
        refresh_counts(job)
        writer.writerow(["Title"])
        for row in job.rows:
            if row.include_final and row.decision == "DO" and row.cleaned_title:
                writer.writerow([row.cleaned_title])
    else:
        writer.writerow([
            "#",
            "Original Title",
            "Title Extraction",
            "Removed Text",
            "Tag",
            "Policy",
            "Reason Notes",
            "Confidence",
            "Error",
        ])
        out_index = 0
        for row in job.rows:
            if not row.include_final:
                continue
            out_index += 1
            writer.writerow([
                out_index,
                row.original_title,
                row.cleaned_title,
                "; ".join(row.removed_words),
                row.type,
                row.status,
                row.reason,
                row.confidence,
                row.error,
            ])
    buf.seek(0)
    filename = f"{kind}_{safe_niche}_{job.id}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/scraper", response_class=HTMLResponse)
async def scraper_home(request: Request, user: str = Depends(authenticate)):
    return templates.TemplateResponse("scraper.html", {
        "request": request,
        "version": APP_VERSION,
        "user": user,
        "recent_scrapes": list_scrape_jobs(),
        "has_rapidapi_key": bool(os.getenv("RAPIDAPI_KEY") or get_rapidapi_key()),
    })


@app.post("/scraper/settings")
async def save_scraper_settings(
    request: Request,
    rapidapi_key: str = Form(""),
    user: str = Depends(authenticate),
):
    save_setting("rapidapi_key", rapidapi_key.strip())
    return RedirectResponse(url=request.headers.get("referer", "/scraper"), status_code=303)


@app.post("/scraper/jobs")
async def create_scraper_job(
    request: Request,
    background_tasks: BackgroundTasks,
    name: str = Form(""),
    pasted: str = Form(""),
    run_now: str = Form("no"),
    rapidapi_key: str = Form(""),
    file: Optional[UploadFile] = File(None),
    user: str = Depends(authenticate),
):
    titles: list[str] = []
    source_name = ""
    if file is not None and file.filename:
        source_name = Path(file.filename).stem.replace("_", " ").replace("-", " ").strip()
        titles = parse_upload(file.filename, await file.read())
    elif pasted.strip():
        titles = parse_text(pasted)
        source_name = titles[0][:64] if titles else ""
    if not titles:
        raise HTTPException(status_code=400, detail="Provide titles for scraping.")
    scrape_id = uuid.uuid4().hex[:10]
    job = ScrapeJob(
        id=scrape_id,
        name=name.strip() or source_name or "Title Scraper run",
        created_at=utc_now(),
        updated_at=utc_now(),
        state="QUEUED" if run_now == "yes" else "READY",
        titles=titles,
    )
    append_scrape_log(job, f"Created Title Scraper job with {len(titles)} title(s).")
    save_scrape_job(job)
    key = rapidapi_key.strip()
    if key:
        save_setting("rapidapi_key", key)
    if run_now == "yes":
        background_tasks.add_task(run_bulk_scrape, scrape_id, key or None)
    return RedirectResponse(url=f"/scraper/jobs/{scrape_id}", status_code=303)


@app.get("/scraper/jobs/{scrape_id}", response_class=HTMLResponse)
async def view_scraper_job(request: Request, scrape_id: str, user: str = Depends(authenticate)):
    job = load_scrape_job(scrape_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scraper job not found")
    phase1_job = load_job(job.source_phase1_job_id) if job.source_phase1_job_id else None
    return templates.TemplateResponse("scraper_job.html", {
        "request": request,
        "job": job,
        "phase1_job": phase1_job,
        "version": APP_VERSION,
        "user": user,
        "has_rapidapi_key": bool(os.getenv("RAPIDAPI_KEY") or get_rapidapi_key()),
    })


@app.post("/scraper/jobs/{scrape_id}/run")
async def run_scraper_job(
    scrape_id: str,
    background_tasks: BackgroundTasks,
    rapidapi_key: str = Form(""),
    run_mode: str = Form("search"),
    user: str = Depends(authenticate),
):
    job = load_scrape_job(scrape_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scraper job not found")
    if job.state == "RUNNING":
        return RedirectResponse(url=f"/scraper/jobs/{scrape_id}", status_code=303)
    key = rapidapi_key.strip()
    if key:
        save_setting("rapidapi_key", key)
    if not (key or os.getenv("RAPIDAPI_KEY") or get_rapidapi_key()):
        job.message = "Add RAPIDAPI_KEY in Settings before running Title Scraper."
        append_scrape_log(job, "Run blocked: missing RAPIDAPI_KEY.")
        save_scrape_job(job)
        return RedirectResponse(url=f"/scraper/jobs/{scrape_id}", status_code=303)
    if run_mode == "subs":
        background_tasks.add_task(fetch_one_match_subs, scrape_id, key or None)
        append_scrape_log(job, "Queued subscriber fetch for 1-match titles.")
    else:
        background_tasks.add_task(run_bulk_scrape, scrape_id, key or None, run_mode == "retry_failed")
        append_scrape_log(job, f"Queued bulk scrape mode: {run_mode}.")
    job.state = "QUEUED"
    job.message = "Queued..."
    save_scrape_job(job)
    return RedirectResponse(url=f"/scraper/jobs/{scrape_id}", status_code=303)


@app.get("/scraper/jobs/{scrape_id}/status")
async def scraper_status(scrape_id: str, user: str = Depends(authenticate)):
    job = load_scrape_job(scrape_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scraper job not found")
    return {
        "id": job.id,
        "state": job.state,
        "message": job.message,
        "total": job.total,
        "processed": job.processed,
        "failed": job.failed,
        "progress_pct": job.progress_pct,
        "result_count": len(job.results),
        "one_match_count": job.one_match_count,
        "two_match_count": job.two_match_count,
        "three_match_count": job.three_match_count,
        "saturation_count": job.saturation_count,
        "no_match_count": job.no_match_count,
        "logs": job.logs[-20:],
    }


@app.get("/scraper/jobs/{scrape_id}/download")
async def download_scraper_job(scrape_id: str, kind: str = "master", user: str = Depends(authenticate)):
    job = load_scrape_job(scrape_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scraper job not found")
    buf = io.StringIO()
    writer = csv.writer(buf)
    if kind in {"one-match", "freelancer"}:
        writer.writerow(["Title", "Subs", "Match Count", "Status Tagging"])
        for title in sorted({row.input_title for row in job.results if row.match_count == 1 and row.matched_result}):
            matched = next((row for row in job.results if row.input_title == title and row.matched_result), None)
            writer.writerow([
                title,
                matched.subs if matched else "",
                matched.match_count if matched else "",
                matched.status_tagging if matched else "",
            ])
    else:
        writer.writerow(["Input Title", "Result Title", "Result Views", "Channel ID", "Subs", "Search Results Position", "Opportunity Priority", "Match Count", "Status Tagging"])
        for row in job.results:
            writer.writerow([
                row.input_title,
                row.result_title,
                row.views,
                row.channel_id,
                row.subs,
                row.search_position,
                row.opportunity_priority,
                row.match_count,
                row.status_tagging,
            ])
    buf.seek(0)
    safe_name = job.name.replace(" ", "_")
    filename = f"{kind}_{safe_name}_{job.id}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/jobs/{job_id}/backup")
async def backup_job(job_id: str, user: str = Depends(authenticate)):
    job = load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    payload = json.dumps(job.__dict__ | {"rows": [row.__dict__ for row in job.rows]}, ensure_ascii=False, indent=2)
    filename = f"job_backup_{job.niche.replace(' ', '_')}_{job.id}.json"
    return StreamingResponse(
        iter([payload]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "version": APP_VERSION, "jobs": len(list_jobs(1000))}
