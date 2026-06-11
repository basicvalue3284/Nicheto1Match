# YT AutoFill v10

Working copy based on the existing v9 extension.

## New In v10

- Imports `yt-upload-command-center/v1` manifest files.
- Keeps the existing batch JSON + thumbnail filename matching flow.
- Shows schedule date/time on the expanded matched row.
- Adds copy buttons for schedule date, time, or both.

## Manual Upload Rule

The extension fills metadata after a draft is open. It does not upload MP4 files,
does not click through final publishing decisions, and does not bulk monetize or
public videos.

## Chrome Install

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select this folder: `tools/yt_autofill_v10`.

Keep the old v9 folder installed until v10 is tested on a small batch.
