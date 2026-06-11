# TubeFlow Local Renderer SOP For Windows Freelancers

## Purpose

This setup creates the final TubeFlow video locally on the freelancer's Windows PC.

The freelancer records the screen at 1.5x audio speed. The local renderer then:

1. Slows the screen recording back to normal 1x speed.
2. Removes the rough OBS recording audio.
3. Adds the clean TubeFlow 1x audio.
4. Exports the final MP4 for Google Drive upload.

## Folder Meaning

### Downloads

TubeFlow 1x audio is downloaded here.

Example:

```text
C:\Users\<name>\Downloads\cloudflare_schema_validation.mp3
```

### Videos\LosslessCut

LosslessCut exports the trimmed OBS video here.

Example:

```text
C:\Users\<name>\Videos\LosslessCut\cloudflare_schema_validation.mp4
```

### Desktop\Ready_For_Google_Drive

The final video appears here.

Example:

```text
C:\Users\<name>\Desktop\Ready_For_Google_Drive\cloudflare_schema_validation_FINAL.mp4
```

### Videos\LosslessCut\Processed_By_TubeFlow

After the final video is created, the raw trimmed video is moved here automatically.

This prevents the same video from rendering again.

### Videos\LosslessCut\Needs_Admin_Help

If something fails, the video is moved here.

Common reasons:

- Audio name does not match video name.
- Audio was not downloaded.
- FFmpeg is not installed.
- Video file was incomplete.

## One-Time Setup

### Step 1: Install Python

1. Open this link:

   ```text
   https://www.python.org/downloads/windows/
   ```

2. Download Python for Windows.

3. During installation, tick:

   ```text
   Add python.exe to PATH
   ```

4. Complete installation.

### Step 2: Install FFmpeg

Official FFmpeg page:

```text
https://ffmpeg.org/download.html
```

Recommended Windows build:

```text
https://www.gyan.dev/ffmpeg/builds/
```

Simplest install method on Windows 10/11:

1. Press Windows key.
2. Search:

   ```text
   Command Prompt
   ```

3. Right-click and choose `Run as administrator`.
4. Paste this command:

   ```text
   winget install Gyan.FFmpeg
   ```

5. Press Enter.
6. After installation, close Command Prompt and open it again.

Admin check:

1. Press Windows key.
2. Search:

   ```text
   Command Prompt
   ```

3. Open it and type:

   ```text
   ffmpeg -version
   ```

4. If version details appear, FFmpeg is working.

Video tutorial search link:

```text
https://www.youtube.com/results?search_query=install+ffmpeg+windows+11+add+to+path
```

Use a recent video that shows `winget install Gyan.FFmpeg` or adding FFmpeg to Windows PATH.

### Step 3: Copy Renderer Folder

Copy the full renderer folder to:

```text
C:\TubeFlow_Local_Renderer
```

The folder must contain:

```text
renderer.py
config.json
Start_TubeFlow_Renderer.bat
```

### Step 4: Create Working Folders

Create this folder:

```text
C:\Users\<name>\Videos\LosslessCut
```

Create this folder:

```text
C:\Users\<name>\Desktop\Ready_For_Google_Drive
```

## OBS Settings

Open OBS, then use these settings.

### Video Settings

Go to:

```text
Settings > Video
```

Use:

```text
Base Canvas Resolution: 1920x1080
Output Scaled Resolution: 1920x1080
Downscale Filter: Lanczos
Common FPS Values: 30
```

### Output Recording Settings

Go to:

```text
Settings > Output
```

Set Output Mode:

```text
Advanced
```

Go to the Recording tab.

Use:

```text
Recording Format: MKV
Video Encoder: Hardware H.264 if available
Audio Encoder: AAC
Rate Control: CBR
Bitrate: 15000 Kbps
Keyframe Interval: 2 s
Preset: Quality
Profile: High
```

If MKV is not accepted by LosslessCut, use MP4. MKV is safer if OBS crashes.

### Audio Settings

Go to:

```text
Settings > Audio
```

Use:

```text
Sample Rate: 44.1 kHz
Channels: Mono or Stereo
```

The final renderer removes OBS audio and uses TubeFlow clean audio, so OBS audio is only for reference.

## Daily Work Process

### Step 1: Start Renderer

Before creating videos, double-click:

```text
C:\TubeFlow_Local_Renderer\Start_TubeFlow_Renderer.bat
```

Keep the black window open while working.

It should say:

```text
Waiting for LosslessCut exports...
```

### Step 2: Create Audio In TubeFlow

1. Open TubeFlow.
2. Create the video topic.
3. Generate script and audio.
4. Download the 1x audio file.
5. Keep the audio in Downloads.

Rename the audio clearly.

Good:

```text
how_to_enable_cloudflare_schema_validation.mp3
```

Bad:

```text
audio.mp3
download (4).mp3
final audio.mp3
```

### Step 3: Record Screen In OBS

1. Open OBS.
2. Start recording.
3. In TubeFlow, click Start Recording / play audio.
4. Audio plays at 1.5x.
5. Follow the steps on screen.
6. Stop recording after the task is complete.

### Step 4: Trim In LosslessCut

Freelancers must use LosslessCut before final render.

Trim:

- Delay at the beginning.
- Delay at the end.

Do not cut important middle parts.

Export to:

```text
C:\Users\<name>\Videos\LosslessCut
```

Name the exported video the same as the audio.

Good:

```text
how_to_enable_cloudflare_schema_validation.mp4
```

### Step 5: Wait For Final Output

The renderer will show:

```text
Found video
Matched audio
Starting FFmpeg render
Final video ready
```

Open:

```text
C:\Users\<name>\Desktop\Ready_For_Google_Drive
```

Upload only the `_FINAL.mp4` file.

## Quality Check Before Upload

Before uploading to Google Drive, play the final video and check:

- Screen text is sharp.
- Audio is clean.
- Audio matches the screen action.
- Start delay is removed.
- End delay is removed.
- Final file name ends with `_FINAL.mp4`.

## Important Rules

1. Keep the renderer window open during work.
2. Audio and video names must match.
3. Download only one audio at a time when testing.
4. Always trim in LosslessCut before final render.
5. Upload only the file from `Ready_For_Google_Drive`.
6. Do not upload the raw OBS recording.
7. Do not upload the file from `Processed_By_TubeFlow`.

## What To Do If There Is A Problem

### Final video did not appear

Check:

```text
C:\Users\<name>\Videos\LosslessCut\Needs_Admin_Help
```

Then contact admin.

### Audio is wrong

Stop work and contact admin.

Do not continue creating many videos until the issue is fixed.

### Renderer says FFmpeg not found

FFmpeg is not installed correctly.

Contact admin.

### Renderer window was closed

Open it again:

```text
C:\TubeFlow_Local_Renderer\Start_TubeFlow_Renderer.bat
```

Then continue.

## Admin Notes

Current render profile:

```text
Speed correction: setpts=1.5*PTS
Resolution: 1920x1080
FPS: 30
Video codec: H.264 libx264
Quality: CRF 18
Preset: veryfast
Audio codec: AAC
Audio bitrate: 96k
Audio sample rate: 44100 Hz
Audio channels: mono
```

This is designed to be sharp and reliable for YouTube upload.
