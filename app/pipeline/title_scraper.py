"""Phase 2 YouTube title scraper powered by RapidAPI."""
from __future__ import annotations

import asyncio
import os
import re
from difflib import SequenceMatcher
from typing import Any

import httpx

from app.store.scrapes import ScrapeJob, ScrapeResult, append_scrape_log, load_scrape_job, save_scrape_job
from app.store.settings import get_rapidapi_key

RAPID_HOST = "youtube-search-and-download.p.rapidapi.com"
SEARCH_URL = f"https://{RAPID_HOST}/search"
CHANNEL_URLS = (
    f"https://{RAPID_HOST}/channel",
    f"https://{RAPID_HOST}/channel/about",
)
MAX_SEARCH_RESULTS = 15
MATCH_EVALUATION_RESULTS = 5
MAX_ATTEMPTS = 4
RETRYABLE_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}
STOP_WORDS = {
    "a",
    "an",
    "and",
    "for",
    "how",
    "in",
    "into",
    "of",
    "on",
    "or",
    "the",
    "to",
    "use",
    "using",
    "with",
    "your",
}


async def run_bulk_scrape(job_id: str, rapidapi_key: str | None = None, retry_failed_only: bool = False, auto_fetch_subs: bool = True) -> None:
    job = load_scrape_job(job_id)
    if not job:
        return
    key = rapidapi_key or os.getenv("RAPIDAPI_KEY", "") or get_rapidapi_key()
    if not key:
        job.state = "READY"
        job.message = "Add RAPIDAPI_KEY in Settings before scraping."
        append_scrape_log(job, "Search blocked: missing RAPIDAPI_KEY.")
        save_scrape_job(job)
        return

    job.state = "RUNNING"
    job.message = "Searching titles..."
    if not retry_failed_only:
        job.results = []
        job.processed = 0
        job.failed = 0
    save_scrape_job(job)

    failed_titles = {row.input_title for row in job.results if row.error} if retry_failed_only else set()
    titles = [title for title in job.titles if not retry_failed_only or title in failed_titles]
    if retry_failed_only:
        job.results = [row for row in job.results if row.input_title not in failed_titles]
        job.processed = len({row.input_title for row in job.results})
        job.failed = 0
        save_scrape_job(job)

    headers = {
        "x-rapidapi-host": RAPID_HOST,
        "x-rapidapi-key": key,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        for title in titles:
            try:
                payload = await _get_json(client, SEARCH_URL, headers, {"query": title, "hl": "en", "gl": "US"})
                videos = _extract_videos(payload)[:MAX_SEARCH_RESULTS]
                count_top5 = _match_count(title, videos, 5)
                count_top10 = _match_count(title, videos, 10)
                count_top15 = _match_count(title, videos, 15)
                match_count = count_top5
                tier = _match_tier(count_top5, count_top10, count_top15)
                status = _status_tag(match_count, "Pending...")
                rows = videos or [{"title": "", "views": "", "channel_id": "", "channel_title": ""}]
                for position, video in enumerate(rows):
                    matched_result = position < MATCH_EVALUATION_RESULTS and _is_title_match(title, video["title"])
                    search_position = position + 1
                    job.results.append(ScrapeResult(
                        index=len(job.results),
                        input_title=title,
                        result_title=video["title"],
                        views=video["views"],
                        channel_id=video["channel_id"],
                        channel_title=video["channel_title"],
                        search_position=search_position,
                        match_count=match_count,
                        match_count_top5=count_top5,
                        match_count_top10=count_top10,
                        match_count_top15=count_top15,
                        match_tier=tier,
                        subscriber_score="",
                        opportunity_priority=_opportunity_priority(tier, search_position if matched_result else 0),
                        status_tagging=status,
                        matched_result=matched_result,
                    ))
                append_scrape_log(job, f"Searched: {title} ({match_count} match).")
            except Exception as exc:  # noqa: BLE001 - stored for user retry
                job.failed += 1
                job.results.append(ScrapeResult(
                    index=len(job.results),
                    input_title=title,
                    status_tagging="Error",
                    error=str(exc)[:300],
                ))
                append_scrape_log(job, f"Search failed: {title} - {str(exc)[:140]}")
            job.processed = min(job.total, job.processed + 1)
            save_scrape_job(job)

    job.state = "COMPLETED" if job.failed == 0 else "FAILED"
    job.message = "Bulk scrape complete." if job.failed == 0 else f"Bulk scrape completed with {job.failed} error(s)."
    save_scrape_job(job)
    if auto_fetch_subs and job.failed == 0 and job.one_match_count > 0:
        append_scrape_log(job, "Auto-queued subscriber fetch for 1-match titles.")
        save_scrape_job(job)
        await fetch_one_match_subs(job_id, key)


async def fetch_one_match_subs(job_id: str, rapidapi_key: str | None = None) -> None:
    job = load_scrape_job(job_id)
    if not job:
        return
    key = rapidapi_key or os.getenv("RAPIDAPI_KEY", "") or get_rapidapi_key()
    if not key:
        job.message = "Add RAPIDAPI_KEY in Settings before fetching subscribers."
        append_scrape_log(job, "Subscriber fetch blocked: missing RAPIDAPI_KEY.")
        save_scrape_job(job)
        return

    one_match_titles = {row.input_title for row in job.results if row.match_count == 1 and row.matched_result}
    channel_ids = sorted({row.channel_id for row in job.results if row.input_title in one_match_titles and row.matched_result and row.channel_id})
    if not channel_ids:
        job.message = "No 1-match channel IDs found for subscriber fetch."
        append_scrape_log(job, job.message)
        save_scrape_job(job)
        return

    job.state = "RUNNING"
    job.message = "Fetching subscribers for 1-match titles..."
    save_scrape_job(job)
    headers = {
        "x-rapidapi-host": RAPID_HOST,
        "x-rapidapi-key": key,
    }
    sub_map: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=60) as client:
        for channel_id in channel_ids:
            try:
                sub_map[channel_id] = await _fetch_channel_subs(client, headers, channel_id)
            except Exception as exc:  # noqa: BLE001
                sub_map[channel_id] = "Error"
                append_scrape_log(job, f"Subscriber fetch failed: {channel_id} - {str(exc)[:140]}")
            save_scrape_job(job)

    for row in job.results:
        if row.channel_id in sub_map and row.input_title in one_match_titles and row.matched_result:
            row.subs = sub_map[row.channel_id]
            row.status_tagging = _status_tag(row.match_count, row.subs)
            row.subscriber_score = _subscriber_score(row.subs)
            row.opportunity_priority = _opportunity_priority(row.match_tier, row.search_position)
    job.state = "COMPLETED"
    job.message = "Subscriber fetch complete."
    append_scrape_log(job, f"Fetched subscribers for {len(channel_ids)} channel(s).")
    save_scrape_job(job)


async def _fetch_channel_subs(client: httpx.AsyncClient, headers: dict[str, str], channel_id: str) -> str:
    last_error: Exception | None = None
    for url in CHANNEL_URLS:
        try:
            data = await _get_json(client, url, headers, {"id": channel_id})
            subs = _find_subscriber_text(data)
            if subs:
                return subs
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    if last_error:
        raise last_error
    return "Not found"


async def _get_json(client: httpx.AsyncClient, url: str, headers: dict[str, str], params: dict[str, str]) -> dict[str, Any]:
    last_exc: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = await client.get(url, headers=headers, params=params)
            if response.status_code in RETRYABLE_STATUS_CODES and attempt < MAX_ATTEMPTS:
                await asyncio.sleep(min(8, 1.5 * attempt))
                continue
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(min(8, 1.5 * attempt))
    raise RuntimeError(str(last_exc) if last_exc else "RapidAPI request failed")


def _extract_videos(data: Any) -> list[dict[str, str]]:
    videos: list[dict[str, str]] = []

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            video = node.get("video") if isinstance(node.get("video"), dict) else node
            title = _text_value(video.get("title"))
            channel_id = _text_value(video.get("channelId") or video.get("channelID"))
            if not channel_id and isinstance(video.get("channel"), dict):
                channel_id = _text_value(video["channel"].get("channelId") or video["channel"].get("id"))
            if title and (channel_id or video.get("videoId") or video.get("views") or video.get("viewCountText")):
                videos.append({
                    "title": title,
                    "views": _view_text(video),
                    "channel_id": channel_id,
                    "channel_title": _channel_title(video),
                })
                return
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for item in node:
                visit(item)

    visit(data)
    unique: list[dict[str, str]] = []
    seen = set()
    for video in videos:
        key = (video["title"].lower(), video["channel_id"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(video)
    return unique


def _is_title_match(input_title: str, result_title: str) -> bool:
    a = _normalized(input_title)
    b = _normalized(result_title)
    if not a or not b:
        return False
    if a in b:
        return True
    a_core = " ".join(_important_tokens(a))
    b_core = " ".join(_important_tokens(b))
    if a_core and b_core:
        if a_core in b_core:
            return True
        a_parts = a_core.split()
        b_parts = b_core.split()
        if b_core in a_core and len(b_parts) >= max(2, int(len(a_parts) * 0.75)):
            return True
    score = SequenceMatcher(None, a, b).ratio()
    if score >= 0.90:
        return True
    return False


def _status_tag(match_count: int, subs: str) -> str:
    if match_count == 0:
        return "No Match"
    if match_count == 1:
        if subs and subs not in {"Pending...", "Error", "Not found"}:
            return f"1 Match ({_subscriber_bucket(subs)})"
        return "1 Match (Pending Stats)"
    if match_count == 2:
        return "2 Match"
    if match_count == 3:
        return "3 Match"
    return "Saturation"


def _match_count(input_title: str, videos: list[dict[str, str]], limit: int) -> int:
    return sum(1 for video in videos[:limit] if _is_title_match(input_title, video["title"]))


def _match_tier(top5: int, top10: int, top15: int) -> str:
    if top15 == 1:
        return "Top 15 1-Match"
    if top10 == 1:
        return "Top 10 1-Match"
    if top5 == 1:
        return "Top 5 1-Match"
    return ""


def _subscriber_score(subs: str) -> str:
    value = _number_from_text(subs)
    if value is None:
        return "Pending"
    if value < 5_000:
        return "10S"
    if value < 10_000:
        return "8S"
    if value < 25_000:
        return "6S"
    if value < 100_000:
        return "4S"
    return "2S"


def _opportunity_priority(match_tier: str, search_position: int) -> str:
    if match_tier == "Top 15 1-Match":
        tier = "A"
    elif match_tier == "Top 10 1-Match":
        tier = "B"
    elif match_tier == "Top 5 1-Match":
        tier = "C"
    else:
        return ""
    if search_position <= 0:
        return f"{tier}-Review"
    return f"{tier}-P{search_position:02d}"


def _subscriber_bucket(subs: str) -> str:
    value = _number_from_text(subs)
    if value is None:
        return subs
    if value < 5_000:
        return "<5k"
    if value < 10_000:
        return "5k-10k"
    if value < 25_000:
        return "10k-25k"
    return "25k+"


def _find_subscriber_text(data: Any) -> str:
    keys = {"subscriberCountText", "subscribers", "subscriberCount", "subscriber_count"}
    if isinstance(data, dict):
        for key, value in data.items():
            if key in keys:
                text = _text_value(value)
                if text:
                    return text
        for value in data.values():
            found = _find_subscriber_text(value)
            if found:
                return found
    elif isinstance(data, list):
        for item in data:
            found = _find_subscriber_text(item)
            if found:
                return found
    return ""


def _view_text(video: dict[str, Any]) -> str:
    for key in ("viewCountText", "views", "viewCount", "view_count"):
        text = _text_value(video.get(key))
        if text:
            return text
    return ""


def _channel_title(video: dict[str, Any]) -> str:
    if isinstance(video.get("channel"), dict):
        title = _text_value(video["channel"].get("name") or video["channel"].get("title"))
        if title:
            return title
    return _text_value(video.get("channelName") or video.get("channelTitle") or video.get("author"))


def _text_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        if "text" in value:
            return _text_value(value["text"])
        if "simpleText" in value:
            return _text_value(value["simpleText"])
        if "runs" in value and isinstance(value["runs"], list):
            return "".join(_text_value(run.get("text")) for run in value["runs"] if isinstance(run, dict)).strip()
        for key in ("label", "name", "title", "value"):
            text = _text_value(value.get(key))
            if text:
                return text
    return ""


def _normalized(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value.lower())).strip()


def _important_tokens(value: str) -> list[str]:
    return [token for token in value.split() if len(token) > 2 and token not in STOP_WORDS]


def _number_from_text(text: str) -> float | None:
    match = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*([kKmMbB]?)", text)
    if not match:
        return None
    number = float(match.group(1).replace(",", ""))
    suffix = match.group(2).lower()
    if suffix == "k":
        number *= 1_000
    elif suffix == "m":
        number *= 1_000_000
    elif suffix == "b":
        number *= 1_000_000_000
    return number
