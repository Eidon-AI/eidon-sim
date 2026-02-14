# Sensor-Only Sync: Design & Implementation Plan

Records sensor data on the phone while filming with an external camera, then syncs both recordings using audio tone markers.

## Overview

Adds a third recording mode — **sensor-only** — alongside "full" and "video-only." The phone emits a known-frequency sync tone that gets captured by the external camera's microphone and timestamped in the sensor JSON. After recording, the user uploads the external video via the Sim, and the API detects the tone in both sources to trim and align them automatically.

### End-to-End Flow

1. User enables "Sensor Only Mode" in Flutter app settings. Connects trackers. Starts recording.
2. Phone plays a 1kHz sine tone (500ms) at max volume. Timestamp marked in sensor JSON.
3. Every 2 minutes, the phone plays the same tone and marks it in sensor data.
4. User stops recording. Sensor data uploads to API (no video, no thumbnail).
5. In the Sim, user visits `/upload`, selects the sensor-only recording, and uploads the external camera video.
6. API receives the video, extracts audio, detects the 1kHz tone markers, cross-references with sensor JSON timestamps, trims video to align with sensor start/end.
7. Recording upgrades from sensor-only to a full recording with synced video + sensor data.

---

## Changes by Repo

### 1. Flutter App (`eidon-flutter-app`)

#### Settings

- Add "Sensor Only Mode" toggle in settings, alongside existing "Video Only Mode."
- Mutually exclusive — enabling one disables the other.
- New `sensorOnly` field on user profile (or repurpose existing mode system into tri-state).

#### Recording Screen (sensor-only mode)

- No camera preview. Black background with:
  - Recording duration timer (large, centered)
  - Connected device status indicators
  - Stop button
  - Visual pulse/flash each time a sync tone plays
- On recording start:
  - Set device volume to max
  - Play a 500ms, 1kHz sine wave (use `flutter_sound` or raw AudioTrack)
  - Record exact timestamp in sensor JSON under new `syncMarkers` array
- Every 2 minutes: play tone again, append timestamp to `syncMarkers`
- On stop: upload sensor JSON only (no video, no thumbnail)

#### Sensor JSON Addition

New top-level field in the sensor recording:

```json
{
  "syncMarkers": [
    { "time": 0, "type": "start" },
    { "time": 120000, "type": "periodic" },
    { "time": 240000, "type": "periodic" }
  ],
  "snapshots": [ ... ]
}
```

#### Upload Flow

Same as current full recording but skips video and thumbnail. `generate-upload-urls` handles `sensorOnly: true` (no video URL generated).

---

### 2. API Backend (`eidon-sym-api`)

#### Database Changes

- Add `sensorOnly` boolean to recording entity (default `false`)
- Add `syncStatus` enum to recording entity: `pending_video`, `processing`, `synced`, `failed`

#### Modified Endpoints

**`POST /recordings/generate-upload-urls`**
- Accept `sensorOnly: true`. Only generate signed URL for sensor data (no video, no thumbnail).
- Create recording entity with `sensorOnly: true`, `syncStatus: pending_video`.

**`POST /recordings/upload`** (complete recording)
- Accept `sensorOnly: true`. Skip video/thumbnail validation.

#### New Endpoints

**`POST /recordings/:id/sync-external-video`**
1. Validate recording is `sensorOnly` with sensor data uploaded
2. Generate signed upload URL for external video
3. Return URL to client

**`POST /recordings/:id/process-sync`**
Triggered after video upload completes:
1. Download sensor JSON from GCS, read `syncMarkers`
2. Download uploaded external video from GCS
3. Extract audio with ffmpeg
4. Detect 1kHz tone in audio (bandpass filter + energy envelope)
5. Match detected tones to sensor `syncMarkers`
6. Calculate trim points, trim video with ffmpeg
7. Generate thumbnail from first frame
8. Upload trimmed video + thumbnail to recording's GCS path
9. Update recording: `sensorOnly: false`, populate `videoUrl`/`thumbnailUrl`, set `syncStatus: synced`
10. Return `202 Accepted` — processing happens async. Client polls for status.

**`GET /recordings/:id/sync-status`**
Returns current `syncStatus` for polling.

#### Sync Processing Service

New service (`SyncProcessingService`) that handles the audio analysis and video trimming. Uses `child_process` to call ffmpeg, plus FFT-based audio analysis (e.g. `fft.js`).

**Container change:** Add ffmpeg to the Cloud Run Docker image.

---

### 3. Sim Web App (`eidon-sim`)

#### New Page: `/upload`

Dedicated page (not modal) for uploading external video to sensor-only recordings.

**Left panel — Pending recordings:**
- List of user's sensor-only recordings with `syncStatus: pending_video`
- Each shows: task type, date, duration, device count
- User selects one to upload against

**Right panel — Upload & status:**
- When recording selected: details + drag-and-drop / file picker for video
- Upload progress bar during upload
- Once upload completes: calls `process-sync`, status shows "Processing sync..."
- User can navigate away — processing is async
- On return: synced recordings show green "Synced" status, failed show "Failed" with retry

**Navigation:**
- Add "Upload" link in header nav
- Sensor-only recordings in recordings modal can link to `/upload`

---

## Audio Detection & Sync Algorithm

### Tone Detection

1. **Extract audio** from uploaded video:
   ```
   ffmpeg -i input.mp4 -vn -acodec pcm_s16le -ar 44100 -ac 1 output.wav
   ```
   Mono, 44.1kHz, 16-bit PCM.

2. **Detect 1kHz tone:**
   - Apply narrow bandpass filter around 1kHz (950-1050Hz)
   - Compute signal energy in short windows (~20ms)
   - Find sustained energy peaks lasting ~500ms
   - Each peak = detected sync marker

3. **Match markers:**
   - First detected tone in audio = `syncMarkers[0]` (type: "start") in sensor JSON
   - Subsequent tones align with periodic markers at ~2min intervals
   - Multiple periodic markers enable clock drift correction (linear interpolation)

### Video Trimming

4. **Calculate trim points:**
   - `video_start = first_tone_time_in_video`
   - `video_end = video_start + (sensor_endTime - sensor_startTime)`
   - Trim with stream copy (fast, no re-encoding):
     ```
     ffmpeg -i input.mp4 -ss <start> -to <end> -c copy trimmed.mp4
     ```

5. **Generate thumbnail:**
   ```
   ffmpeg -i trimmed.mp4 -vframes 1 -q:v 2 thumbnail.jpg
   ```

### Edge Cases

- **Tone not found:** Mark `syncStatus: failed` with message "Could not detect sync tone in video audio"
- **Multiple false positives:** Use expected 2-minute spacing to disambiguate
- **Video shorter than sensor data:** Trim sensor data to match, or fail with message
- **No audio track in video:** Fail with clear error message

---

## Implementation Order

### Phase 1: Flutter App — Sensor-Only Recording
1. Add `sensorOnly` toggle to settings (mutually exclusive with `videoOnly`)
2. Build sensor-only recording screen (black + timer + device status)
3. Implement 1kHz sine tone generation and playback
4. Add `syncMarkers` to sensor JSON format
5. Modify upload flow to skip video/thumbnail for sensor-only

### Phase 2: API — Sensor-Only Support
6. Add `sensorOnly` and `syncStatus` fields to recording entity + migration
7. Modify `generate-upload-urls` to handle `sensorOnly`
8. Modify `upload` (complete) endpoint to handle `sensorOnly`
9. Add `sync-external-video` endpoint (signed URL generation)
10. Add `sync-status` endpoint

### Phase 3: API — Sync Processing
11. Add ffmpeg to Docker image
12. Build `SyncProcessingService` — audio extraction
13. Implement 1kHz tone detection (bandpass + energy envelope)
14. Implement marker matching and trim calculation
15. Implement video trimming and thumbnail generation
16. Wire up `process-sync` endpoint with async processing

### Phase 4: Sim — Upload Page
17. Create `/upload` route and page layout
18. Build pending recordings list (left panel)
19. Build upload area with drag-and-drop and progress bar
20. Integrate with `sync-external-video` and `process-sync` API endpoints
21. Add polling for sync status with UI feedback
22. Add "Upload" to header navigation
