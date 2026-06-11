# Test TubeFlow Local Renderer On Your Windows PC

Use this before giving the renderer to freelancers.

## Goal

Confirm that the local renderer can:

1. Find the downloaded TubeFlow audio
2. Find the LosslessCut exported video
3. Merge them correctly
4. Create the final `_FINAL.mp4`

## One-Time Setup

### 1. Copy Renderer Folder

Copy the full folder to your Windows PC:

`C:\TubeFlow_Local_Renderer`

The folder must contain:

`renderer.py`

`config.json`

`Start_TubeFlow_Renderer.bat`

### 2. Install Python

Go to:

`https://www.python.org/downloads/windows/`

Install Python.

Important:

Tick `Add python.exe to PATH`.

### 3. Install FFmpeg

Use one of these:

Option A:

Open Microsoft Store, search `FFmpeg`, install it, then restart the computer.

Option B:

Ask admin to install FFmpeg and add it to Windows PATH.

### 4. Create Folders

Create:

`C:\Users\<your name>\Videos\LosslessCut`

`C:\Users\<your name>\Desktop\Ready_For_Google_Drive`

## Test With One Real TubeFlow Video

### Step 1: Start Renderer

Double-click:

`C:\TubeFlow_Local_Renderer\Start_TubeFlow_Renderer.bat`

You should see:

`Waiting for LosslessCut exports...`

Keep this window open.

### Step 2: Generate Audio In TubeFlow

Use a short test title:

`How to Enable Cloudflare Schema Validation`

Download audio.

Rename the downloaded audio to:

`how_to_enable_cloudflare_schema_validation.mp3`

Make sure it is in:

`Downloads`

### Step 3: Record Screen

Open OBS.

Record a short 30-60 second screen test while listening to the audio at `1.5x`.

### Step 4: Trim In LosslessCut

Open the OBS recording in LosslessCut.

Trim:

- start delay
- ending delay

Export the trimmed file to:

`Videos\LosslessCut`

Name it:

`how_to_enable_cloudflare_schema_validation.mp4`

### Step 5: Wait For Render

The renderer should show:

`Found video`

`Matched audio`

`Starting FFmpeg render`

`Final video ready`

### Step 6: Check Output

Open:

`Desktop\Ready_For_Google_Drive`

You should see:

`how_to_enable_cloudflare_schema_validation_FINAL.mp4`

Play it and check:

- screen is sharp
- final audio is clean
- audio and video timing match
- start/end delay is gone

## If It Fails

Check:

`C:\TubeFlow_Local_Renderer\renderer.log`

Common problems:

- Audio and video filenames do not match
- FFmpeg is not installed
- Video exported to the wrong folder
- Audio is not in Downloads

