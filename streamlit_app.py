from __future__ import annotations

import asyncio
import csv
import io
import os
import uuid
from pathlib import Path

import pandas as pd
import streamlit as st
from openpyxl import Workbook

from app.pipeline.defaults import CLEANING_EXAMPLES, POLICY_EXAMPLES, POLICY_PROMPT
from app.pipeline.parser import parse_text, parse_upload
from app.pipeline.processor import _normalize_extracted_title, parse_extra_cleaning_examples, process_job
from app.pipeline.segregate import TYPE_HOW_TO_BOARD, TYPE_HOW_TO_SHORTS, TYPE_HOW_TO_START, TYPE_NON_HOW_TO, segregate, summarize
from app.pipeline.title_scraper import run_bulk_scrape
from app.store.jobs import Job, TitleRow, append_log, list_jobs, load_job, make_rows, refresh_counts, save_job, utc_now
from app.store.scrapes import ScrapeJob, append_scrape_log, list_scrape_jobs, load_scrape_job, save_scrape_job
from app.store.settings import get_gemini_key, get_openai_key, get_rapidapi_key, save_setting


st.set_page_config(page_title="Keyword Wizard", page_icon="🔎", layout="wide")

DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
DEFAULT_PROVIDER = os.getenv("AI_PROVIDER", "openai")
DEFAULT_BATCH_SIZE = int(os.getenv("BATCH_SIZE", "25"))
TYPE_OPTIONS = [TYPE_HOW_TO_START, TYPE_HOW_TO_BOARD, TYPE_HOW_TO_SHORTS, TYPE_NON_HOW_TO]


def run_async(coro) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(coro)
    else:
        new_loop = asyncio.new_event_loop()
        try:
            new_loop.run_until_complete(coro)
        finally:
            new_loop.close()


def apply_styles() -> None:
    st.markdown(
        """
        <style>
          .stApp { background: #fafafa; color: #202124; }
          .block-container { padding-top: 1.4rem; max-width: 1680px; }
          h1, h2, h3 { letter-spacing: 0; }
          h1 { text-align: center; font-size: 1.6rem !important; margin-bottom: 1rem !important; }
          div[data-testid="stMetric"] { background: #fff; border: 1px solid #e8e9ee; border-radius: 8px; padding: .65rem .75rem; }
          div[data-testid="stMetricLabel"] p { font-size: .72rem; color: #5f6368; }
          div[data-testid="stMetricValue"] { font-size: 1.05rem; }
          .soft-panel { background: #fff; border: 1px solid #e8e9ee; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
          .green-note { background: #eaf8ef; border: 1px solid #bfe8cf; color: #24733c; border-radius: 8px; padding: .75rem .9rem; font-weight: 700; }
          .warn-note { background: #fff7e6; border: 1px solid #f0d28a; color: #8a5a00; border-radius: 8px; padding: .75rem .9rem; font-weight: 700; }
          .small-muted { color: #737780; font-size: .8rem; }
          .stButton > button, .stDownloadButton > button { border-radius: 6px; min-height: 2rem; font-size: .82rem; }
        </style>
        """,
        unsafe_allow_html=True,
    )


def settings_panel() -> dict[str, str | int]:
    with st.sidebar:
        st.header("Settings")
        provider = st.selectbox("AI provider", ["openai", "gemini"], index=0 if DEFAULT_PROVIDER == "openai" else 1, key="settings_provider")
        model_options = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"] if provider == "openai" else ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash", "gemini-2.5-flash"]
        model = st.selectbox("Model", model_options, index=0, key="settings_model")
        batch_size = st.number_input("Batch size", min_value=5, max_value=50, value=DEFAULT_BATCH_SIZE, step=5, key="settings_batch")

        openai_key = st.text_input("OpenAI key", type="password", placeholder="Saved" if get_openai_key() else "Paste and save", key="settings_openai_key")
        gemini_key = st.text_input("Gemini key", type="password", placeholder="Saved" if get_gemini_key() else "Paste and save", key="settings_gemini_key")
        rapidapi_key = st.text_input("RapidAPI key", type="password", placeholder="Saved" if get_rapidapi_key() else "Paste and save", key="settings_rapidapi_key")
        if st.button("Save API Keys", use_container_width=True, key="settings_save_keys"):
            if openai_key:
                save_setting("openai_key", openai_key)
            if gemini_key:
                save_setting("gemini_key", gemini_key)
            if rapidapi_key:
                save_setting("rapidapi_key", rapidapi_key)
            st.success("API keys saved.")

        st.divider()
        st.caption("Extraction title rules / examples")
        extra_examples = st.text_area(
            "Add more examples",
            value="",
            height=180,
            placeholder="Raw title => Cleaned title\nRaw title | Cleaned title | note",
            key="settings_examples",
        )
        policy_prompt = st.text_area("Policy checker prompt", value=POLICY_PROMPT, height=260, key="settings_policy_prompt")

    return {
        "provider": provider,
        "model": model,
        "batch_size": int(batch_size),
        "extra_examples": extra_examples,
        "policy_prompt": policy_prompt,
    }


def titles_from_inputs(uploaded_file, pasted: str) -> tuple[list[str], str]:
    if uploaded_file is not None:
        content = uploaded_file.read()
        name = Path(uploaded_file.name).stem.replace("_", " ").replace("-", " ").strip()
        return parse_upload(uploaded_file.name, content), name
    titles = parse_text(pasted)
    name = titles[0][:64] if titles else "Keyword Wizard run"
    return titles, name


def preview_dataframe(rows: list[TitleRow]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Select": False,
                "#": row.index,
                "Title": row.original_title,
                "Tag": row.type,
                "Final": row.include_final,
            }
            for row in rows
        ]
    )


def result_dataframe(job: Job) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Select": False,
                "#": row.index,
                "Title": row.original_title,
                "Title Extraction": row.cleaned_title or "(waiting...)",
                "Removed Text": ", ".join(row.removed_words),
                "Tag": row.type,
                "Policy": row.status,
                "Reason Notes": row.error or row.reason,
                "Move to Step 3": row.include_final and row.decision == "DO" and bool(row.cleaned_title),
            }
            for row in job.rows
            if row.include_final
        ]
    )


def scrape_dataframe(job: ScrapeJob) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Select": False,
                "#": row.index,
                "Input Title": row.input_title,
                "Title Found": row.result_title,
                "Views": row.views,
                "Subs": row.subs,
                "Match Count": row.match_count,
                "Status Tagging": row.status_tagging,
                "ChannelID": row.channel_id,
            }
            for row in job.results
        ]
    )


def csv_bytes(rows: list[list[str]]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def master_workbook_for_rows(rows: list[TitleRow]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    groups = [
        ("Raw Data", rows),
        ("How-To", [row for row in rows if row.type != TYPE_NON_HOW_TO]),
        ("How-To (Start)", [row for row in rows if row.type == TYPE_HOW_TO_START]),
        ("How-To (Board)", [row for row in rows if row.type == TYPE_HOW_TO_BOARD]),
        ("How-To (Shorts)", [row for row in rows if row.type == TYPE_HOW_TO_SHORTS]),
        ("Non How-To", [row for row in rows if row.type == TYPE_NON_HOW_TO]),
        ("Final List", [row for row in rows if row.include_final]),
    ]
    headers = ["#", "Title", "Title Extraction", "Removed Text", "Tag", "Policy", "Reason Notes", "Final"]
    for name, sheet_rows in groups:
        ws = wb.create_sheet(name[:31])
        ws.append(headers)
        for row in sheet_rows:
            ws.append([
                row.index,
                row.original_title,
                row.cleaned_title,
                ", ".join(row.removed_words),
                row.type,
                row.status,
                row.error or row.reason,
                "Yes" if row.include_final else "No",
            ])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def create_job_from_rows(niche: str, rows: list[TitleRow], cfg: dict[str, str | int], run_now: bool = False) -> Job:
    job_id = uuid.uuid4().hex[:10]
    results = segregate([row.original_title for row in rows])
    cleaning_examples = CLEANING_EXAMPLES + parse_extra_cleaning_examples(str(cfg["extra_examples"]))
    job = Job(
        id=job_id,
        niche=niche or "Keyword Wizard run",
        created_at=utc_now(),
        updated_at=utc_now(),
        state="QUEUED" if run_now else "READY",
        total=len(rows),
        processed=0,
        failed=0,
        batch_size=int(cfg["batch_size"]),
        model=str(cfg["model"]),
        provider=str(cfg["provider"]),
        summary=summarize(results),
        cleaning_examples=cleaning_examples,
        policy_examples=POLICY_EXAMPLES,
        policy_prompt=str(cfg["policy_prompt"]) or POLICY_PROMPT,
        rows=rows,
        raw_count=len(rows),
        duplicate_count=0,
        auto_export=False,
    )
    append_log(job, f"Created Streamlit job with {len(rows)} title(s).")
    save_job(job)
    st.session_state["active_job_id"] = job.id
    if run_now:
        key = get_gemini_key() if job.provider == "gemini" else get_openai_key()
        run_async(process_job(job.id, key or None))
    return load_job(job.id) or job


def save_preview_edits(rows: list[TitleRow], edited: pd.DataFrame) -> list[TitleRow]:
    by_index = {row.index: row for row in rows}
    for record in edited.to_dict("records"):
        row = by_index.get(int(record["#"]))
        if not row:
            continue
        row.original_title = str(record["Title"]).strip() or row.original_title
        row.type = str(record["Tag"])
        row.include_final = bool(record["Final"])
    return list(by_index.values())


def selected_indices(df: pd.DataFrame) -> list[int]:
    if df.empty or "Select" not in df.columns:
        return []
    return [int(row["#"]) for row in df.to_dict("records") if row.get("Select")]


def step_one(cfg: dict[str, str | int]) -> None:
    st.subheader("Step 1: Upload Files")
    uploaded = st.file_uploader("Upload CSV / TSV / TXT / XLSX", type=["csv", "tsv", "txt", "xlsx", "xls"], key="step1_upload")
    pasted = st.text_area("Or paste titles", height=120, placeholder="One title per line", key="step1_paste_titles")
    niche = st.text_input("Niche name", placeholder="Auto-filled from file or first title", key="step1_niche")

    titles, source_name = titles_from_inputs(uploaded, pasted)
    if not niche:
        niche = source_name
    if not titles:
        st.info("Upload a file or paste titles to start.")
        return

    rows = make_rows(segregate(titles))
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("Raw List", len(rows))
    c2.metric("How-To", sum(row.type != TYPE_NON_HOW_TO for row in rows))
    c3.metric("How-To (Start)", sum(row.type == TYPE_HOW_TO_START for row in rows))
    c4.metric("How-To (Board)", sum(row.type == TYPE_HOW_TO_BOARD for row in rows))
    c5.metric("How-To (Shorts)", sum(row.type == TYPE_HOW_TO_SHORTS for row in rows))
    c6.metric("Final List", sum(row.include_final for row in rows))

    bucket = st.radio("Tools & Filter", ["Final List", "Raw Data", "How-To", "How-To (Start)", "How-To (Board)", "How-To (Shorts)", "Non How-To"], horizontal=True, key="step1_bucket")
    visible_rows = filter_rows(rows, bucket)
    edited = st.data_editor(
        preview_dataframe(visible_rows),
        use_container_width=True,
        hide_index=True,
        column_config={
            "Select": st.column_config.CheckboxColumn(width="small"),
            "Tag": st.column_config.SelectboxColumn(options=TYPE_OPTIONS),
            "Final": st.column_config.CheckboxColumn(),
        },
        key=f"preview_{bucket}",
    )
    edited_rows = save_preview_edits(rows, edited)
    selected = selected_indices(edited)
    if selected and st.button(f"Remove selected row(s) ({len(selected)})", key="step1_remove_selected"):
        edited_rows = [row for row in edited_rows if row.index not in set(selected)]
        for idx, row in enumerate(edited_rows, start=1):
            row.index = idx
        st.rerun()

    final_titles = [[row.original_title] for row in edited_rows if row.include_final]
    dl1, dl2, run_col = st.columns([1, 1, 1.2])
    dl1.download_button("Download Final List", csv_bytes([["Title"], *final_titles]), "final_titles.csv", "text/csv", use_container_width=True, key="step1_download_final")
    dl2.download_button("Download Master Sheet", master_workbook_for_rows(edited_rows), "master_titles.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", use_container_width=True, key="step1_download_master")
    if run_col.button("Send to Step 2: Extract & Policy", type="primary", use_container_width=True, key="step1_send_step2"):
        job = create_job_from_rows(niche, edited_rows, cfg, run_now=True)
        st.success(f"Step 2 job ready: {job.id}")
        st.rerun()


def filter_rows(rows: list[TitleRow], bucket: str) -> list[TitleRow]:
    if bucket == "Raw Data":
        return rows
    if bucket == "How-To":
        return [row for row in rows if row.type != TYPE_NON_HOW_TO]
    if bucket == "Final List":
        return [row for row in rows if row.include_final]
    return [row for row in rows if row.type == bucket]


def step_two() -> None:
    st.subheader("Step 2: Extract & Policy checker")
    recent = list_jobs(30)
    ids = [job.id for job in recent]
    active = st.session_state.get("active_job_id")
    index = ids.index(active) if active in ids else 0 if ids else None
    if not ids:
        st.info("Create a Step 1 run first.")
        return
    job_id = st.selectbox("Run", ids, index=index, format_func=lambda jid: f"{load_job(jid).niche} · {jid}", key="step2_job_select")  # type: ignore[union-attr]
    job = load_job(job_id)
    if not job:
        return
    st.session_state["active_job_id"] = job.id

    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Final", job.final_count)
    m2.metric("Safe", job.safe_count)
    m3.metric("Risky", job.risky_count)
    m4.metric("Prohibited", job.prohibited_count)
    m5.metric("Errors", job.failed)
    st.progress(job.progress_pct / 100 if job.final_count else 0, text=f"{job.state}: {job.processed} / {job.final_count} processed")

    a1, a2, a3, a4, a5, a6 = st.columns(6)
    if a1.button("Test 25", use_container_width=True, key="step2_test25"):
        run_async(process_job(job.id, limit=25))
        st.rerun()
    if a2.button("Retry Pending", use_container_width=True, key="step2_retry_pending"):
        run_async(process_job(job.id, retry_pending_only=True))
        st.rerun()
    if a3.button("Retry failed", use_container_width=True, key="step2_retry_failed"):
        run_async(process_job(job.id, retry_failed_only=True))
        st.rerun()
    if a4.button("Run Full Step 2", type="primary", use_container_width=True, key="step2_run_full"):
        run_async(process_job(job.id))
        st.rerun()
    if a5.button("Reprocess All", use_container_width=True, key="step2_reprocess_all"):
        run_async(process_job(job.id, reprocess_all=True))
        st.rerun()
    if a6.button("Refresh", use_container_width=True, key="step2_refresh"):
        st.rerun()

    policy_filter = st.radio("Policy", ["All", "Pending", "Safe", "Risky", "Prohibited", "Errors"], horizontal=True, key="step2_policy_filter")
    df = result_dataframe(job)
    if policy_filter != "All":
        key = "ERROR" if policy_filter == "Errors" else policy_filter.upper()
        df = df[df["Policy"].str.upper() == key]

    edited = st.data_editor(
        df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Select": st.column_config.CheckboxColumn(width="small"),
            "Tag": st.column_config.SelectboxColumn(options=TYPE_OPTIONS),
            "Policy": st.column_config.SelectboxColumn(options=["PENDING", "SAFE", "RISKY", "PROHIBITED", "ERROR"]),
            "Move to Step 3": st.column_config.CheckboxColumn(),
        },
        key=f"job_{job.id}_{policy_filter}",
    )
    sync_job_table(job, edited)
    selected = selected_indices(edited)
    b1, b2, b3, b4 = st.columns([1, 1, 1, 1.4])
    if b1.button("Mark selected SAFE", disabled=not selected, use_container_width=True, key="step2_mark_safe"):
        mark_safe(job, selected)
        st.rerun()
    if b2.button("Remove selected", disabled=not selected, use_container_width=True, key="step2_remove_selected"):
        remove_rows(job, selected)
        st.rerun()
    if b3.download_button("Download Master Sheet", master_workbook_for_rows(job.rows), f"master_{job.id}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", use_container_width=True, key="step2_download_master"):
        pass
    ready_titles = [[row.cleaned_title] for row in job.rows if row.include_final and row.decision == "DO" and row.cleaned_title]
    b4.download_button("Download SAFE Titles", csv_bytes([["Title"], *ready_titles]), f"safe_titles_{job.id}.csv", "text/csv", use_container_width=True, key="step2_download_safe")

    st.markdown("<div class='green-note'>SAFE / DO titles move to Step 3 by default. Risky/error rows can be overridden manually.</div>", unsafe_allow_html=True)
    if st.button("Step 3: Start Title Scraping", type="primary", key="step2_start_scraping"):
        scrape = create_scrape_from_job(job)
        run_async(run_bulk_scrape(scrape.id))
        st.session_state["active_scrape_id"] = scrape.id
        st.rerun()


def sync_job_table(job: Job, edited: pd.DataFrame) -> None:
    by_index = {row.index: row for row in job.rows}
    changed = False
    for record in edited.to_dict("records"):
        row = by_index.get(int(record["#"]))
        if not row:
            continue
        cleaned = str(record["Title Extraction"]).strip()
        if cleaned != "(waiting...)":
            row.cleaned_title = cleaned
        row.type = str(record["Tag"])
        row.status = str(record["Policy"]).upper()
        row.include_final = bool(record["Move to Step 3"])
        if row.status == "SAFE" and row.cleaned_title:
            row.decision = "DO"
            row.reason = ""
        changed = True
    if changed:
        refresh_counts(job)
        save_job(job)


def mark_safe(job: Job, indices: list[int]) -> None:
    for row in job.rows:
        if row.index in indices:
            if not row.cleaned_title:
                row.cleaned_title, row.removed_words = _normalize_extracted_title(row.original_title)
            row.status = "SAFE"
            row.decision = "DO"
            row.reason = ""
            row.error = ""
            row.include_final = True
    refresh_counts(job)
    append_log(job, f"Marked {len(indices)} row(s) SAFE in Streamlit.")
    save_job(job)


def remove_rows(job: Job, indices: list[int]) -> None:
    job.rows = [row for row in job.rows if row.index not in set(indices)]
    for idx, row in enumerate(job.rows, start=1):
        row.index = idx
    refresh_counts(job)
    append_log(job, f"Removed {len(indices)} selected row(s) in Streamlit.")
    save_job(job)


def create_scrape_from_job(job: Job) -> ScrapeJob:
    titles = [row.cleaned_title for row in job.rows if row.include_final and row.decision == "DO" and row.cleaned_title]
    for existing in list_scrape_jobs(1000):
        if existing.source_phase1_job_id == job.id:
            existing.titles = titles
            existing.state = "QUEUED"
            existing.message = "Queued from Streamlit Step 2..."
            append_scrape_log(existing, f"Updated from Streamlit Step 2 job {job.id}.")
            save_scrape_job(existing)
            return existing
    scrape = ScrapeJob(
        id=uuid.uuid4().hex[:10],
        name=f"{job.niche} - Title Scraper",
        created_at=utc_now(),
        updated_at=utc_now(),
        state="QUEUED",
        titles=titles,
        source_phase1_job_id=job.id,
    )
    append_scrape_log(scrape, f"Created from Streamlit Step 2 job {job.id}.")
    save_scrape_job(scrape)
    return scrape


def step_three() -> None:
    st.subheader("Step 3 : Title Scraper (1 Match Found)")
    recent = list_scrape_jobs(30)
    ids = [job.id for job in recent]
    active = st.session_state.get("active_scrape_id")
    index = ids.index(active) if active in ids else 0 if ids else None
    if not ids:
        st.info("Send SAFE titles from Step 2 or paste titles into the standalone scraper below.")
        standalone_scraper()
        return
    scrape_id = st.selectbox("Scraper run", ids, index=index, format_func=lambda jid: f"{load_scrape_job(jid).name} · {jid}", key="step3_scrape_select")  # type: ignore[union-attr]
    job = load_scrape_job(scrape_id)
    if not job:
        return
    st.session_state["active_scrape_id"] = job.id

    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("Total", job.total)
    c2.metric("1 Match", job.one_match_count)
    c3.metric("2 Match", job.two_match_count)
    c4.metric("3 Match", job.three_match_count)
    c5.metric("Saturation", job.saturation_count)
    c6.metric("0 Match", job.no_match_count)
    st.progress(job.progress_pct / 100 if job.total else 0, text=f"{job.state}: {job.processed} / {job.total}")

    s1, s2, s3 = st.columns([1, 1, 1])
    if s1.button("Start Titles Scrape & Subs Data", type="primary", use_container_width=True, key="step3_start"):
        run_async(run_bulk_scrape(job.id))
        st.rerun()
    if s2.button("Retry failed", use_container_width=True, key="step3_retry_failed"):
        run_async(run_bulk_scrape(job.id, retry_failed_only=True))
        st.rerun()
    one_titles = sorted({row.input_title for row in job.results if row.match_count == 1 and row.matched_result})
    s3.download_button("Copy/Download 1 Match Titles", csv_bytes([["Title"], *[[title] for title in one_titles]]), f"one_match_{job.id}.csv", "text/csv", use_container_width=True, key="step3_download_one_match")

    filter_name = st.radio("Filters", ["Show All", "1 Match", "2 Match", "3 Match", "Saturation", "0 Match"], horizontal=True, key="step3_filter")
    df = scrape_dataframe(job)
    if filter_name != "Show All" and not df.empty:
        if filter_name == "1 Match":
            df = df[(df["Match Count"] == 1) & (df["Title Found"] != "")]
        elif filter_name == "2 Match":
            df = df[df["Match Count"] == 2]
        elif filter_name == "3 Match":
            df = df[df["Match Count"] == 3]
        elif filter_name == "Saturation":
            df = df[df["Match Count"] > 3]
        elif filter_name == "0 Match":
            df = df[df["Match Count"] == 0]
        df = df.drop_duplicates("Input Title")

    search = st.text_input("Search titles", key="step3_search")
    if search and not df.empty:
        q = search.lower()
        df = df[df.astype(str).apply(lambda row: row.str.lower().str.contains(q).any(), axis=1)]
    st.data_editor(df, use_container_width=True, hide_index=True, key=f"scrape_{job.id}_{filter_name}")


def standalone_scraper() -> None:
    st.markdown("### Standalone Title Scraper")
    pasted = st.text_area("Paste titles for Step 3", height=120, key="standalone_scraper_titles")
    if st.button("Create & Start Titles Scrape", key="standalone_scraper_start"):
        titles = parse_text(pasted)
        if not titles:
            st.warning("Paste at least one title.")
            return
        scrape = ScrapeJob(
            id=uuid.uuid4().hex[:10],
            name=titles[0][:64] or "Title Scraper run",
            created_at=utc_now(),
            updated_at=utc_now(),
            state="QUEUED",
            titles=titles,
        )
        save_scrape_job(scrape)
        run_async(run_bulk_scrape(scrape.id))
        st.session_state["active_scrape_id"] = scrape.id
        st.rerun()


def main() -> None:
    apply_styles()
    st.title("Keyword Wizard")
    cfg = settings_panel()
    step = st.tabs(["Step 1: Tools & Filter", "Step 2: Extract & Policy", "Step 3: Title Scraper"])
    with step[0]:
        step_one(cfg)
    with step[1]:
        step_two()
    with step[2]:
        step_three()


if __name__ == "__main__":
    main()
