# TubeFlow Local Renderer - Mac Test

Use this when you want to test TubeFlow local rendering on your own Mac.

## One-Time Setup

1. Install FFmpeg if it is not already installed.

   If you use Homebrew:

   ```bash
   brew install ffmpeg
   ```

2. Open this folder:

   ```text
   ~/Desktop/TubeFlow_Local_Render
   ```

3. You will see these folders:

   ```text
   01_Audio_1x
   02_OBS_or_LosslessCut_Video
   03_Final_Output
   04_Processed_Raw_Video
   05_Needs_Checking
   ```

## Daily Test Flow

1. Download the 1x audio from TubeFlow.

2. Move that `.mp3` file into:

   ```text
   01_Audio_1x
   ```

3. Put your OBS recording, or your trimmed LosslessCut video, into:

   ```text
   02_OBS_or_LosslessCut_Video
   ```

4. Make sure the audio and video names match.

   Good example:

   ```text
   how_to_enable_cloudflare_schema_validation.mp3
   how_to_enable_cloudflare_schema_validation.mp4
   ```

5. Double-click:

   ```text
   Start_TubeFlow_Renderer_Mac.command
   ```

6. The final video will appear in:

   ```text
   03_Final_Output
   ```

## What The Renderer Does

- Slows the 1.5x OBS recording back to normal 1x timing.
- Removes the rough OBS audio.
- Adds the clean 1x TubeFlow audio.
- Exports a final 1920x1080 MP4.

## Important

Use matching filenames for the first test. This prevents the wrong audio from being selected.
