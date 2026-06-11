import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path


APP_NAME = "TubeFlow Local Renderer"
LOG_PATH = Path(__file__).with_name("renderer.log")


def log(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {message}"
    print(line, flush=True)
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def chime(success=True):
    if sys.platform != "win32":
        return
    try:
        import winsound

        if success:
            winsound.MessageBeep(winsound.MB_OK)
        else:
            winsound.MessageBeep(winsound.MB_ICONHAND)
    except Exception:
        pass


def config_path_from_args():
    if len(sys.argv) >= 3 and sys.argv[1] == "--config":
        return Path(sys.argv[2]).expanduser()
    return Path(__file__).with_name("config.json")


def load_config():
    config_path = config_path_from_args()
    if not config_path.exists():
        raise FileNotFoundError(f"Missing config file: {config_path}")
    with config_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data


def expand_path(value):
    return Path(os.path.expandvars(value)).expanduser()


def ensure_folder(path):
    path.mkdir(parents=True, exist_ok=True)


def normalize_name(value):
    value = value.lower()
    value = re.sub(r"\([^)]*\)", " ", value)
    value = re.sub(r"\[[^\]]*\]", " ", value)
    value = re.sub(r"[_\-\s]+trimmed$", "", value)
    value = re.sub(r"[_\-\s]+losslesscut$", "", value)
    value = re.sub(r"[_\-\s]+audio$", "", value)
    value = re.sub(r"[_\-\s]+video$", "", value)
    value = re.sub(r"[_\-\s]+final$", "", value)
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


def is_complete_file(path, checks=4, delay=1.0):
    if not path.exists():
        return False
    last_size = -1
    for _ in range(checks):
        try:
            size = path.stat().st_size
        except OSError:
            return False
        if size <= 0:
            time.sleep(delay)
            continue
        if size == last_size:
            return True
        last_size = size
        time.sleep(delay)
    return False


def find_audio_for_video(video_path, downloads_folder, config):
    video_key = normalize_name(video_path.stem)
    mp3_files = sorted(downloads_folder.glob("*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True)

    for audio_path in mp3_files:
        audio_key = normalize_name(audio_path.stem)
        if audio_key == video_key or video_key in audio_key or audio_key in video_key:
            return audio_path, "name match"

    if config.get("strict_name_match", True):
        return None, "no matching MP3 name found"

    window_seconds = int(config.get("fallback_to_newest_audio_within_minutes", 3)) * 60
    video_time = video_path.stat().st_mtime
    candidates = [
        audio_path
        for audio_path in mp3_files
        if abs(video_time - audio_path.stat().st_mtime) <= window_seconds
    ]
    if candidates:
        return candidates[0], "newest MP3 near video time"
    return None, "no MP3 found near video export time"


def safe_output_name(video_path):
    name = normalize_name(video_path.stem)
    if not name:
        name = "tubeflow_video"
    return f"{name}_FINAL.mp4"


def run_ffmpeg(video_path, audio_path, output_path, config):
    width = int(config.get("output_width", 1920))
    height = int(config.get("output_height", 1080))
    fps = int(config.get("output_fps", 30))
    speed = float(config.get("speed_multiplier", 1.5))
    crf = str(config.get("video_crf", 18))
    preset = str(config.get("video_preset", "veryfast"))
    audio_bitrate = str(config.get("audio_bitrate", "96k"))
    sample_rate = int(config.get("audio_sample_rate", 44100))
    channels = str(config.get("audio_channels", "mono"))

    if channels == "mono":
        audio_filter = f"aformat=sample_rates={sample_rate}:channel_layouts=mono"
    else:
        audio_filter = f"aformat=sample_rates={sample_rate}:channel_layouts=stereo"

    video_filter = (
        f"[0:v]setpts={speed}*PTS,"
        f"fps={fps},"
        f"scale={width}:{height}:force_original_aspect_ratio=decrease:flags=lanczos,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,"
        f"format=yuv420p[v];"
        f"[1:a]{audio_filter}[a]"
    )

    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-i",
        str(audio_path),
        "-filter_complex",
        video_filter,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        preset,
        "-crf",
        crf,
        "-c:a",
        "aac",
        "-b:a",
        audio_bitrate,
        "-movflags",
        "+faststart",
        "-shortest",
        str(output_path),
    ]

    log("Starting FFmpeg render...")
    log("Video: " + str(video_path))
    log("Audio: " + str(audio_path))
    log("Output: " + str(output_path))

    creation_flags = 0
    if sys.platform == "win32":
        creation_flags = subprocess.CREATE_NO_WINDOW

    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        creationflags=creation_flags,
    )

    if result.returncode != 0:
        log("FFmpeg failed:")
        log(result.stdout[-4000:])
        return False

    log("Render complete.")
    return True


def move_file_safely(source, destination_folder):
    ensure_folder(destination_folder)
    destination = destination_folder / source.name
    if destination.exists():
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        destination = destination_folder / f"{source.stem}_{stamp}{source.suffix}"
    shutil.move(str(source), str(destination))
    return destination


def process_video(video_path, config):
    downloads_folder = expand_path(config["downloads_folder"])
    output_folder = expand_path(config["output_folder"])
    processed_folder = expand_path(config["processed_folder"])
    failed_folder = expand_path(config["failed_folder"])

    if not is_complete_file(video_path):
        log(f"Video is not ready yet, will retry later: {video_path.name}")
        return

    audio_path, match_reason = find_audio_for_video(video_path, downloads_folder, config)
    if not audio_path:
        log(f"Audio not found for {video_path.name}: {match_reason}")
        chime(False)
        move_file_safely(video_path, failed_folder)
        return

    ensure_folder(output_folder)
    output_path = output_folder / safe_output_name(video_path)
    if output_path.exists():
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = output_folder / f"{normalize_name(video_path.stem)}_FINAL_{stamp}.mp4"

    log(f"Matched audio by {match_reason}: {audio_path.name}")
    success = run_ffmpeg(video_path, audio_path, output_path, config)

    if success and output_path.exists():
        move_file_safely(video_path, processed_folder)
        log(f"Final video ready: {output_path}")
        chime(True)
    else:
        move_file_safely(video_path, failed_folder)
        log(f"Moved failed video to: {failed_folder}")
        chime(False)


def check_ffmpeg():
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False


def main():
    print(f"\n{APP_NAME}\n" + "=" * len(APP_NAME))
    config = load_config()

    if not check_ffmpeg():
        log("ERROR: FFmpeg was not found. Install FFmpeg and restart this renderer.")
        chime(False)
        input("Press Enter to close...")
        return

    watch_folder = expand_path(config["video_watch_folder"])
    output_folder = expand_path(config["output_folder"])
    processed_folder = expand_path(config["processed_folder"])
    failed_folder = expand_path(config["failed_folder"])
    downloads_folder = expand_path(config["downloads_folder"])

    for folder in [watch_folder, output_folder, processed_folder, failed_folder, downloads_folder]:
        ensure_folder(folder)

    log(f"Watching folder: {watch_folder}")
    log(f"Audio folder: {downloads_folder}")
    log(f"Final output folder: {output_folder}")
    log("Waiting for LosslessCut exports...")

    seen = set()
    while True:
        try:
            videos = sorted(
                list(watch_folder.glob("*.mp4")) + list(watch_folder.glob("*.mov")) + list(watch_folder.glob("*.m4v")),
                key=lambda p: p.stat().st_mtime,
            )
            for video_path in videos:
                key = str(video_path.resolve())
                if key in seen:
                    continue
                seen.add(key)
                log(f"Found video: {video_path.name}")
                process_video(video_path, config)
            time.sleep(3)
        except KeyboardInterrupt:
            log("Renderer stopped by user.")
            break
        except Exception as exc:
            log(f"Unexpected error: {exc}")
            chime(False)
            time.sleep(5)


if __name__ == "__main__":
    main()
