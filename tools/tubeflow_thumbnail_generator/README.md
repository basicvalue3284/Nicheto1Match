# TubeFlow Thumbnail Maker

Standalone thumbnail generator for testing before integrating into TubeFlow.

## What It Does

- Creates 1280x720 YouTube thumbnails in the dashboard mockup style.
- Bulk-generates one thumbnail per pasted search-based title.
- Auto-generates short CTR-style thumbnail text from each title.
- Uses the approved dashboard-style layout:
  - person cutout always on the right
  - dark modern grid background
  - background/accent matched to the app/logo color
  - big yellow CTR word
  - white supporting text
  - app/logo target in the bottom-left
  - arrow/highlight pointing to the app/logo
- Bundles the provided person image as the default right-side person.
- Removes white backgrounds from person uploads and auto-crops empty space.
- Provides person size and position controls for matching the dashboard thumbnail cards.
- Exports the current preview as a PNG.
- In Chrome/Edge, can bulk-save PNGs directly to a selected Google Drive-synced folder.
- Auto-fits longer text so titles stay inside the thumbnail.
- Remembers the latest text, color, and template settings in the browser.

## How To Use

1. Open `index.html` in Chrome.
2. Paste one search-based title per line.
3. Click `Preview First Title`.
4. Use the bundled person image, or upload a replacement person image.
5. Upload the app/logo image.
6. Keep `Match logo color` enabled so the background and arrow follow the app/logo color.
7. Adjust text size, arrow visibility, and export file name if needed.
8. Click `Choose Drive Folder` and select the Google Drive folder where thumbnails should save.
9. Click `Save All to Drive Folder`, or use `Download PNG` for the current preview as backup.

## Google Drive Note

Browsers do not expose the full local file path for security. In Chrome/Edge, the tool can save directly into a folder you choose, including a Google Drive for Desktop synced folder. After saving, drag the PNG from that folder into YouTube Studio.

## Best Person Image

The bundled person image is already included. For replacement images, a transparent PNG works best, but the tool can remove a white background automatically. Use the person size and position sliders to match the dashboard mockup.

## Later TubeFlow Integration

After the template is approved, this can be moved into TubeFlow as:

- a separate `Thumbnail Generator` tab, or
- a button after script generation: `Create Thumbnail`.

Recommended later automation:

1. TubeFlow search titles create thumbnail text automatically.
2. Tool/app name selects the matching logo and accent color.
3. Standard person cutout is reused automatically.
4. Final thumbnails save into the configured Google Drive folder.
