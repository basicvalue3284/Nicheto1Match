# YT Upload Command Center

Local helper for manual YouTube Studio upload batches.

## Daily Flow

1. Download or sync the freelancer's Google Drive date folder locally.
2. Open `index.html` in Chrome.
3. Drop the local folder into the page.
4. Fix blocked rows if any MP4/JSON metadata is missing.
5. Choose batch size, schedule date, start/end time, and interval.
6. Export the manifest.
7. Load the manifest plus thumbnails into `YT AutoFill v10`.
8. Drag the MP4 files into YouTube Studio manually.
9. Open each draft, click fill, copy schedule date/time if needed, then manually save/schedule.

## Safety Rule

This tool does not upload videos to YouTube Studio and does not public/monetize videos.
The uploader remains in control of all YouTube Studio actions.

## Schedule Format

The exported schedule uses YouTube-style display text:

```text
May 30, 2026
12:00 PM
```

Default timezone label is `GMT+0530`.
