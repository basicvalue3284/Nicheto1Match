"""Local settings store for API keys and app preferences."""
from __future__ import annotations

import json
import os
from pathlib import Path

DATA_ROOT = Path(os.getenv("DATA_ROOT") or ("/tmp/nicheto1match/data" if os.getenv("VERCEL") else "data"))
SETTINGS_PATH = DATA_ROOT / "settings.json"


def load_settings() -> dict[str, str]:
    if not SETTINGS_PATH.exists():
        return {}
    try:
        data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def save_setting(key: str, value: str) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = load_settings()
    if value:
        data[key] = value
    else:
        data.pop(key, None)
    SETTINGS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_rapidapi_key() -> str:
    return load_settings().get("rapidapi_key", "")


def get_openai_key() -> str:
    return load_settings().get("openai_key", "")


def get_gemini_key() -> str:
    return load_settings().get("gemini_key", "")
