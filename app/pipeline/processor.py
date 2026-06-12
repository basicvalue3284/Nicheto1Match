"""Batch LLM processor for cleaning titles and policy checking."""
from __future__ import annotations

import asyncio
import json
import os
import random
import re
from typing import Any

import httpx

from app.pipeline.defaults import CLEANING_INSTRUCTIONS
from app.store.jobs import Job, TitleRow, append_log, load_job, refresh_counts, save_job
from app.store.settings import get_gemini_key, get_openai_key

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
RETRYABLE_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}
MAX_API_ATTEMPTS = 5


class ProviderAuthError(RuntimeError):
    """Raised when a provider key is present but rejected by the API."""


def parse_extra_cleaning_examples(raw: str) -> list[dict[str, str]]:
    """Parse user-added examples from textarea lines.

    Accepted formats:
    Before => After
    Before | After | optional notes
    """
    examples: list[dict[str, str]] = []
    for line in raw.splitlines():
        text = line.strip()
        if not text:
            continue
        if "=>" in text:
            before, after = [part.strip() for part in text.split("=>", 1)]
            notes = ""
        elif "|" in text:
            parts = [part.strip() for part in text.split("|")]
            before = parts[0] if len(parts) > 0 else ""
            after = parts[1] if len(parts) > 1 else ""
            notes = parts[2] if len(parts) > 2 else ""
        else:
            continue
        if before and after:
            examples.append({"before": before, "after": after, "notes": notes})
    return examples


async def process_job(
    job_id: str,
    api_key: str | None = None,
    retry_failed_only: bool = False,
    retry_pending_only: bool = False,
    limit: int | None = None,
    reprocess_all: bool = False,
) -> None:
    job = load_job(job_id)
    if not job:
        return
    provider = getattr(job, "provider", "openai") or "openai"
    key_env = "GEMINI_API_KEY" if provider == "gemini" else "OPENAI_API_KEY"
    saved_key = get_gemini_key() if provider == "gemini" else get_openai_key()
    key = api_key or os.getenv(key_env, "") or saved_key
    if not key:
        job.state = "FAILED"
        job.message = f"Missing {key_env}. Add it to the server environment or enter a one-time key when starting."
        append_log(job, f"Run blocked: missing {provider} API key.")
        save_job(job)
        return

    job.state = "RUNNING"
    mode = "reprocess all rows" if reprocess_all else "retry failed rows" if retry_failed_only else "retry pending rows" if retry_pending_only else "test run" if limit else "full run"
    job.message = f"Cleaning titles and running policy checks ({mode})..."
    append_log(job, f"Started {mode}.")
    save_job(job)

    if reprocess_all:
        statuses = None
    elif retry_failed_only:
        statuses = ("ERROR",)
    elif retry_pending_only:
        statuses = ("PENDING",)
    else:
        statuses = ("PENDING", "ERROR")
    pending = [row for row in job.rows if row.include_final and (statuses is None or row.status in statuses)]
    if limit:
        pending = pending[:limit]
    if not pending:
        job.state = "READY"
        job.message = "No matching final titles to process."
        append_log(job, job.message)
        save_job(job)
        return
    timeout = httpx.Timeout(120.0, connect=20.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        for start in range(0, len(pending), job.batch_size):
            current = load_job(job_id)
            if current:
                job = current
            batch_ids = {row.index for row in pending[start:start + job.batch_size]}
            batch = [row for row in job.rows if row.include_final and row.index in batch_ids]
            if reprocess_all:
                for row in batch:
                    row.cleaned_title = ""
                    row.removed_words = []
                    row.confidence = ""
                    row.status = "PENDING"
                    row.decision = ""
                    row.reason = ""
                    row.error = ""
            try:
                processed = await _process_batch(client, key, job, batch)
                by_index = {row.index: row for row in processed}
                for idx, row in enumerate(job.rows):
                    if row.index in by_index:
                        job.rows[idx] = by_index[row.index]
                append_log(job, f"Processed rows {min(batch_ids)}-{max(batch_ids)}.")
            except ProviderAuthError as exc:
                job.state = "FAILED"
                job.message = str(exc)
                append_log(job, job.message)
                save_job(job)
                return
            except Exception as exc:
                for row in job.rows:
                    if row.index in batch_ids:
                        row.status = "ERROR"
                        row.decision = ""
                        row.reason = ""
                        row.error = str(exc)[:500]
                job.message = f"Batch failed at row {min(batch_ids)}: {exc}"
                append_log(job, job.message)
            refresh_counts(job)
            job.state = "RUNNING"
            save_job(job)
            await asyncio.sleep(0.2)

    final = load_job(job_id) or job
    refresh_counts(final)
    if limit and final.pending_count > 0:
        final.state = "READY"
        final.message = f"Test run complete for {len(pending)} title(s). Review results, then run the full batch."
    else:
        final.state = "COMPLETED" if final.failed == 0 else "NEEDS_REVIEW"
        final.message = "Phase 1 complete. Review risky/error rows, then export."
    append_log(final, final.message)
    save_job(final)


async def _process_batch(
    client: httpx.AsyncClient,
    api_key: str,
    job: Job,
    batch: list[TitleRow],
) -> list[TitleRow]:
    prompt = _build_prompt(job, batch)
    if getattr(job, "provider", "openai") == "gemini":
        content = await _call_gemini(client, api_key, job.model, prompt)
    else:
        content = await _call_openai(client, api_key, job.model, prompt)
    data = _parse_json(content)
    items = data.get("items", data if isinstance(data, list) else [])
    if not isinstance(items, list):
        raise ValueError("LLM response did not include an items array")

    by_original = {_text_key(row.original_title): row for row in batch}
    by_index = {row.index: row for row in batch}
    touched: set[int] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        row = _row_for_llm_item(item, by_original, by_index)
        if row is None:
            continue
        rule_cleaned, rule_removed = _strict_rule_extract_title(row.original_title)
        _apply_result(row, item)
        if row.cleaned_title and not _cleaned_title_is_valid(row.original_title, row.cleaned_title):
            row.cleaned_title = rule_cleaned
            row.removed_words = rule_removed
            row.confidence = "Rule"
            if not _cleaned_title_is_valid(row.original_title, row.cleaned_title):
                row.cleaned_title = ""
                row.removed_words = []
                row.confidence = ""
                row.status = "ERROR"
                row.decision = ""
                row.reason = ""
                row.error = "Model returned a cleaned title that does not match the source title. Reprocess this row."
        touched.add(row.index)
    for row in batch:
        if row.index not in touched:
            row.status = "ERROR"
            row.decision = ""
            row.reason = ""
            row.error = "No result returned by the LLM for this title."
    return batch


def _row_for_llm_item(
    item: dict[str, Any],
    by_original: dict[str, TitleRow],
    by_index: dict[int, TitleRow],
) -> TitleRow | None:
    original = str(item.get("original_title", "")).strip()
    if original:
        exact = by_original.get(_text_key(original))
        if exact is not None:
            return exact

    idx = item.get("index")
    row = by_index.get(idx) if isinstance(idx, int) else None
    if row is None:
        return None
    if not original:
        return row
    return row if _text_similarity(original, row.original_title) >= 0.92 else None


def _text_key(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


_TITLE_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "for",
    "from",
    "how",
    "in",
    "into",
    "is",
    "of",
    "on",
    "or",
    "step",
    "the",
    "to",
    "tutorial",
    "use",
    "using",
    "with",
    "your",
}


def _content_tokens(value: str) -> set[str]:
    tokens = set(re.findall(r"[a-z0-9]+", value.lower()))
    return {token for token in tokens if len(token) > 2 and token not in _TITLE_STOPWORDS}


def _text_similarity(left: str, right: str) -> float:
    left_tokens = _content_tokens(left)
    right_tokens = _content_tokens(right)
    if not left_tokens and not right_tokens:
        return 1.0
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / max(len(left_tokens), len(right_tokens))


def _cleaned_title_is_plausible(original: str, cleaned: str) -> bool:
    original_tokens = _content_tokens(original)
    cleaned_tokens = _content_tokens(cleaned)
    if not cleaned_tokens:
        return False
    if not original_tokens:
        return True
    overlap = original_tokens & cleaned_tokens
    if len(overlap) >= 2:
        return True
    return len(overlap) / max(1, min(len(original_tokens), len(cleaned_tokens))) >= 0.5


def _all_tokens(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", value.lower())


def _cleaned_title_is_strict_subset(original: str, cleaned: str) -> bool:
    """Strict extraction mode: cleaned titles may remove/cut, but not add words."""
    original_counts: dict[str, int] = {}
    for token in _all_tokens(original):
        original_counts[token] = original_counts.get(token, 0) + 1
    for token in _all_tokens(cleaned):
        available = original_counts.get(token, 0)
        if available <= 0:
            return False
        original_counts[token] = available - 1
    return True


def _cleaned_title_is_valid(original: str, cleaned: str) -> bool:
    return _cleaned_title_is_plausible(original, cleaned) and _cleaned_title_is_strict_subset(original, cleaned)


async def _call_openai(client: httpx.AsyncClient, api_key: str, model: str, prompt: str) -> str:
    payload = {
        "model": model,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "You are a precise JSON API. Return only valid JSON matching the requested schema.",
            },
            {"role": "user", "content": prompt},
        ],
    }
    response = await _post_with_retries(
        client,
        OPENAI_CHAT_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
    )
    if response.status_code in {401, 403}:
        raise ProviderAuthError("OpenAI API key was rejected. Add a valid key in Settings, then run Step 2 again.")
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


async def _call_gemini(client: httpx.AsyncClient, api_key: str, model: str, prompt: str) -> str:
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": "You are a precise JSON API. Return only valid JSON matching the requested schema.\n\n"
                        + prompt
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }
    response = await _post_with_retries(
        client,
        GEMINI_GENERATE_URL.format(model=model),
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json=payload,
    )
    if response.status_code in {401, 403}:
        raise ProviderAuthError("Gemini API key was rejected. Add a valid key in Settings, then run Step 2 again.")
    response.raise_for_status()
    data = response.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


async def _post_with_retries(client: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:
    last_exc: Exception | None = None
    for attempt in range(1, MAX_API_ATTEMPTS + 1):
        try:
            response = await client.post(url, **kwargs)
            if response.status_code not in RETRYABLE_STATUS_CODES:
                return response
            if attempt == MAX_API_ATTEMPTS:
                return response
            retry_after = response.headers.get("retry-after")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else min(45.0, 2 ** attempt)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_exc = exc
            if attempt == MAX_API_ATTEMPTS:
                raise
            delay = min(45.0, 2 ** attempt)
        await asyncio.sleep(delay + random.uniform(0, 0.75))
    if last_exc:
        raise last_exc
    raise RuntimeError("API request failed without a response.")


def _apply_result(row: TitleRow, item: dict[str, Any]) -> None:
    raw_cleaned = str(item.get("cleaned_title") or item.get("title") or row.original_title).strip()
    removed = item.get("removed_words", [])
    if isinstance(removed, str):
        removed = [removed] if removed else []
    if not isinstance(removed, list):
        removed = []
    cleaned, deterministic_removed = _normalize_extracted_title(raw_cleaned)
    removed_values = [str(value) for value in removed if str(value).strip()]
    for value in deterministic_removed:
        if value not in removed_values:
            removed_values.append(value)
    status = str(item.get("status") or "RISKY").strip().upper()
    if status not in {"SAFE", "RISKY", "PROHIBITED"}:
        status = "RISKY"
    decision = str(item.get("decision") or "").strip().upper()
    if decision not in {"DO", "REWRITE", "AVOID"}:
        decision = {"SAFE": "DO", "RISKY": "REWRITE", "PROHIBITED": "AVOID"}[status]
    reason = "" if decision == "DO" else str(item.get("reason") or "").strip()

    row.cleaned_title = cleaned
    row.removed_words = removed_values
    row.confidence = str(item.get("confidence") or "").strip() or "Medium"
    row.status = status
    row.decision = decision
    row.reason = reason
    row.error = ""


def _normalize_extracted_title(title: str) -> tuple[str, list[str]]:
    removed: list[str] = []
    cleaned = title.strip()

    hashtag_values = re.findall(r"#\w+", cleaned)
    if hashtag_values:
        removed.extend(hashtag_values)
        cleaned = re.sub(r"\s*#\w+", "", cleaned).strip()

    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -|:;?")
    return cleaned or title.strip(), removed


def _strict_rule_extract_title(title: str) -> tuple[str, list[str]]:
    removed: list[str] = []
    cleaned = title.strip().strip('"“”')

    hashtag_values = re.findall(r"#\w+", cleaned)
    if hashtag_values:
        removed.extend(hashtag_values)
        cleaned = re.sub(r"\s*#\w+", "", cleaned).strip()

    # Drop non-English lead-in when an English how-to title exists later.
    how_match = re.search(r"\bhow\s+to\b", cleaned, flags=re.IGNORECASE)
    if how_match and any(ord(ch) > 127 for ch in cleaned[: how_match.start()]):
        prefix = cleaned[: how_match.start()].strip(" -|:;")
        if prefix:
            removed.append(prefix)
        cleaned = cleaned[how_match.start():].strip()

    # Prefer an existing "How to" segment after a separator when the first segment is a label.
    for sep in ("||", "|", " - ", " – ", " — ", ": "):
        if sep in cleaned:
            parts = [part.strip() for part in cleaned.split(sep) if part.strip()]
            how_parts = [part for part in parts if re.search(r"\bhow\s+to\b", part, flags=re.IGNORECASE)]
            if how_parts and not re.search(r"\bhow\s+to\b", parts[0], flags=re.IGNORECASE):
                chosen = how_parts[0]
                removed.extend(part for part in parts if part != chosen)
                cleaned = chosen
                break
            if parts:
                first = parts[0]
                trailing = parts[1:]
                if trailing and _looks_like_noise(" ".join(trailing)):
                    removed.extend(trailing)
                    cleaned = first
                    break

    noise_patterns = [
        r"\(\s*20\d{2}\s*\)",
        r"\b20\d{2}\b",
        r"\[(?:live proof|updated|full guide|guide|tutorial|beginner(?:s)?|latest|easy)\]",
        r"\((?:full[- ]?guide|guide|tutorial|beginner(?:s)?|updated|latest|quick\s*&\s*easy|quick and easy|step[- ]?by[- ]?step|full review|easy)\)",
        r"\b(?:full[- ]?guide|quick guide|quick\s*&\s*easy|quick and easy|step[- ]?by[- ]?step tutorial|step[- ]?by[- ]?step|for free|free|updated|latest)\b",
    ]
    for pattern in noise_patterns:
        matches = [m.group(0).strip() for m in re.finditer(pattern, cleaned, flags=re.IGNORECASE)]
        if matches:
            removed.extend(matches)
            cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\s+", " ", cleaned)
    if re.search(r"\b(?:in|for|with|on|at|by)\s+20\d{2}\b", title, flags=re.IGNORECASE):
        cleaned = re.sub(r"\b(?:in|for|with|on|at|by)\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+([,/)])", r"\1", cleaned)
    cleaned = cleaned.strip(" -|:;?,.()[]")
    removed = [value for value in removed if value and value.strip()]
    return cleaned or title.strip().strip("?"), removed


def _looks_like_noise(text: str) -> bool:
    return bool(re.search(
        r"\b(tutorial|guide|review|updated|latest|beginner|beginners|quick|easy|full|course|class|hindi|basics|interface|timeline|description)\b|#",
        text,
        flags=re.IGNORECASE,
    ))


def _build_prompt(job: Job, batch: list[TitleRow]) -> str:
    clean_examples = "\n".join(
        f'- Before: "{ex["before"]}"\n  After: "{ex["after"]}"\n  Notes: {ex.get("notes", "")}'
        for ex in job.cleaning_examples[:35]
    )
    policy_examples = "\n".join(
        f'- Title: "{ex["title"]}" | Status: {ex["status"]} | Decision: {ex["decision"]} | Reason: {ex.get("reason", "")}'
        for ex in job.policy_examples[:25]
    )
    titles = "\n".join(
        f'{row.index}. "{row.original_title}" [Type: {row.type}] [Rule extraction: "{_strict_rule_extract_title(row.original_title)[0]}"]'
        for row in batch
    )
    return f"""
You will perform two tasks for each title:
1. Clean/extract the best usable YouTube title.
2. Run the policy audit on the cleaned title.

ABSOLUTE EXTRACTION RULES
- Preserve a leading "How to" / "How To" when it is part of the usable title.
- Remove hashtags from extracted titles.
- Put removed hashtags and discarded trailing/extra text in removed_words.
- Strict mode is ON: do not add grammar words, replacement words, or invented wording.
- The cleaned_title may only contain words already present in the original title.
- Allowed changes: remove words, remove hashtags/symbols, cut noisy sections, or promote an existing title section.
- If the clean title would require adding words, keep the original wording instead or mark the row risky/error.
- These rules override all examples and all model judgment.

CLEANING INSTRUCTIONS
{CLEANING_INSTRUCTIONS}

CLEANING EXAMPLES
{clean_examples}

POLICY INSTRUCTIONS
{job.policy_prompt}

POLICY EXAMPLES
{policy_examples}

TITLES
{titles}

Return one JSON object only:
{{
  "items": [
    {{
      "index": 1,
      "original_title": "...",
      "cleaned_title": "...",
      "removed_words": ["..."],
      "confidence": "High" | "Medium" | "Low",
      "status": "SAFE" | "RISKY" | "PROHIBITED",
      "decision": "DO" | "REWRITE" | "AVOID",
      "reason": ""
    }}
  ]
}}

For SAFE/DO rows, reason must be blank. For risky/prohibited rows, give a concise reason.
"""


def _parse_json(content: str) -> Any:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, flags=re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))
