# TubeFlow Thumbnail Maker

Standalone thumbnail generator for testing before integrating into TubeFlow.

## What It Does

- Creates a 1280x720 YouTube thumbnail.
- Uses a repeatable competitor-style layout:
  - big yellow keyword
  - white supporting text
  - app/logo on one side
  - screenshot in the lower section
  - red arrow
  - standard person cutout
- Exports a PNG file.

## How To Use

1. Open `index.html` in Chrome.
2. Enter the yellow headline word.
3. Enter the white second line.
4. Upload the standard person cutout PNG.
5. Upload the app/logo image.
6. Upload the screen/app screenshot.
7. Click `Download PNG`.

## Best Person Image

Use a transparent PNG cutout of the person. If the person image has a background, remove the background first for a professional thumbnail.

## Later TubeFlow Integration

After the template is approved, this can be moved into TubeFlow as:

- a separate `Thumbnail Generator` tab, or
- a button after script generation: `Create Thumbnail`.

Recommended later automation:

1. TubeFlow title creates thumbnail text automatically.
2. Tool/app name selects the matching logo.
3. Freelancer uploads or selects a screenshot.
4. Standard person cutout is reused automatically.
5. Final thumbnail downloads with the video title.
