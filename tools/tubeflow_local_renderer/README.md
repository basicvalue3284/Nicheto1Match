# TubeFlow Local Renderer

This folder is for Windows freelancers. It watches the LosslessCut export folder, finds the matching TubeFlow audio in Downloads, and creates the final merged MP4 on the Desktop.

## What It Does

1. Watches `%USERPROFILE%\Videos\LosslessCut`
2. Finds matching `.mp3` audio in `%USERPROFILE%\Downloads`
3. Slows the screen recording by `1.5x`
4. Adds the clean TubeFlow audio
5. Saves final video to `%USERPROFILE%\Desktop\Ready_For_Google_Drive`

## One-Time Setup On Freelancer Windows PC

### 1. Install Python

Download Python from:

`https://www.python.org/downloads/windows/`

During install, tick:

`Add python.exe to PATH`

### 2. Install FFmpeg

Simplest option:

1. Open Microsoft Store
2. Search `FFmpeg`
3. Install a trusted FFmpeg package
4. Restart the computer

If FFmpeg is not found, ask admin to install FFmpeg and add it to PATH.

### 3. Copy This Folder

Copy the full `tubeflow_local_renderer` folder to:

`C:\TubeFlow_Local_Renderer`

### 4. Create Folders

Create these folders:

`C:\Users\<your name>\Videos\LosslessCut`

`C:\Users\<your name>\Desktop\Ready_For_Google_Drive`

### 5. Start Renderer

Double-click:

`Start_TubeFlow_Renderer.bat`

Leave the black window open while working. It will say:

`Waiting for LosslessCut exports...`

## Daily Freelancer Workflow

1. Open TubeFlow.
2. Generate script and audio.
3. Download the audio file.
4. Record the screen with OBS while listening to the audio at `1.5x`.
5. Open the OBS recording in LosslessCut.
6. Trim only the start and end delay.
7. Export from LosslessCut to:

`Videos\LosslessCut`

8. Wait for the final file in:

`Desktop\Ready_For_Google_Drive`

9. Upload the final file to Google Drive.

## Important Naming Rule

The audio file and video file must have the same topic name.

Good:

`how_to_enable_cloudflare_schema_validation.mp3`

`how_to_enable_cloudflare_schema_validation.mp4`

Bad:

`audio1.mp3`

`recording final final.mp4`

## If Something Goes Wrong

Check these folders:

`Videos\LosslessCut\Needs_Admin_Help`

`C:\TubeFlow_Local_Renderer\renderer.log`

Common issues:

- Audio name does not match video name
- FFmpeg is not installed
- LosslessCut exported to the wrong folder
- Audio was not downloaded

