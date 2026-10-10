# Reference — Kling API, ffmpeg recipes, pricing

Snapshot taken while building the workflow. **Re-verify pricing and parameters against the live
docs before budgeting**: <https://kling.ai/document-api/llms.txt> lists every page, and each page
is also available as `.md` (append `.md` to the URL for machine-readable text).

## 1. Authentication and domain

| Item | Value |
| --- | --- |
| Domain | `https://api-singapore.klingai.com` (global; the old `api.klingai.com` is the China gateway) |
| Header | `Authorization: Bearer api-key-kling-<43 chars>` |
| Content type | `application/json` |

The `api-key-` prefix is part of the credential. Two auth designs exist and the gateway
distinguishes them:

- **New design (use this):** a single API key, created at <https://kling.ai/dev/api-key>. The model
  version lives **in the path** (`/text-to-video/kling-3.0`).
- **Legacy design:** AccessKey + SecretKey signed into a 3-part HS256 JWT, model version passed as a
  `model_name` body field. Sending a raw key to a legacy path yields
  `1002 The token was expected to have 3 parts, but got 0`; sending an AK/SK-style credential to a
  new path yields `1002 The current API does not support AK/SK`.

Error codes worth recognising: `0` success, `1002` authentication, `1201` parameter validation
(e.g. `prompt cannot be empty` — reaching this means auth succeeded).

Free endpoint, useful before spending:

```
GET /account/costs?start_time=<ms>&end_time=<ms>   -> resource packages, total/remaining units
```

Rate limit for that endpoint is QPS ≤ 1.

## 2. Video generation

```
POST /text-to-video/kling-3.0
POST /text-to-video/kling-2.6
POST /text-to-video/kling-3.0-turbo
```

Body:

```json
{
  "prompt": "...",
  "settings": {
    "resolution": "720p",
    "aspect_ratio": "9:16",
    "duration": 10,
    "audio": "off",
    "multi_shot": true
  },
  "options": { "watermark_info": { "enabled": false } }
}
```

| Field | Values | Notes |
| --- | --- | --- |
| `settings.resolution` | `720p`, `1080p`, `4k` (3.0) / `720p`, `1080p` (2.6) | 4K costs ~5x |
| `settings.aspect_ratio` | `16:9`, `9:16`, `1:1` | Vertical short drama = `9:16` |
| `settings.duration` | 3-15 (3.0), `5` or `10` (2.6) | Must equal the sum of shot durations |
| `settings.audio` | `native`, `off` | `native` = model-generated speech/sound |
| `settings.multi_shot` | true/false | Set `false` to suppress multi-shot parsing |
| `options.watermark_info.enabled` | true/false | Default false; leave false |

Multi-shot prompt grammar (3.0 only):

```
shot 1, 4, description; shot 2, 3, description; shot 3, 3, description
```

Max 6 shots. Each shot ≥1 s. Sum of shot durations **must** equal `settings.duration`.
Per-shot text ≤512 chars, total prompt ≤3072 (≤2500 recommended).

Task lifecycle:

```
POST /text-to-video/...           -> data.id, data.status = submitted
GET  /tasks?task_ids=<id>         -> data[0].status: submitted | processing | succeeded | failed
                                     data[0].outputs[] -> { type: "video", id, url }
```

Download the result URL promptly; Kling clears generated media after ~30 days, and result URLs can
be behind anti-hotlink protection (send a browser-like `User-Agent` and a `Referer`).

## 3. Audio generation

### Video to audio (ambience / SFX)

```
POST /v1/audio/video-to-audio
GET  /v1/audio/video-to-audio/{task_id}
```

| Field | Notes |
| --- | --- |
| `video_id` | A Kling-generated video id (within 30 days, 3-20 s) |
| `video_url` | Or an external mp4/mov ≤100 MB, 3-20 s, 720p/1080p, 512-2160 px |
| `sound_effect_prompt` | ≤200 chars. Literal sound list |
| `bgm_prompt` | ≤200 chars. **Omit this** when you will add BGM separately |
| `asmr_mode` | boolean |

Exactly one of `video_id` / `video_url`. Result: `data.task_result.audios[0].url_mp3` and
`duration_mp3`.

Because input is capped at 20 s, feed it the per-segment clips (10 s) and concatenate the results —
not the finished 60 s master.

### Text to audio (BGM)

```
POST /v1/audio/text-to-audio
GET  /v1/audio/text-to-audio/{task_id}
```

| Field | Notes |
| --- | --- |
| `prompt` | ≤200 chars |
| `duration` | 3.0-10.0 s, one decimal |

Returns `url_mp3` and `url_wav`. Tile a 10 s cue with `-stream_loop -1 -t <seconds>`.

### Text to speech (account-gated)

```
POST /v1/audio/tts
GET  /v1/audio/tts/{task_id}
```

| Field | Notes |
| --- | --- |
| `text` | ≤1000 chars, content-moderated |
| `voice_id` | Language-scoped, from the vendor's Voice Guide. `oversea_male1` works for `en` |
| `voice_language` | `zh` or `en` — the **same** voice id is not valid across both |
| `voice_speed` | 0.8-2.0, one decimal |

`GET /v1/general/presets-voices?pageNum=1&pageSize=200` returns a small preset voice list with
**numeric** ids (e.g. Owen, William, Catherine, Laura). Those ids are for video-generation voice
control, **not** for `/v1/audio/tts` — passing them there returns `Voice id not found`. If TTS
submissions succeed but tasks fail at processing, the account has no TTS resource package; fall
back to `settings.audio: "native"` on the video call.

### Lip sync (two-step)

```
POST /v1/videos/identify-face        -> data.session_id, data.face_data[].face_id
POST /v1/videos/advanced-lip-sync    -> per-face audio insertion, one face per call
```

`face_choose[].sound_file` accepts base64 audio or a URL (`.mp3/.wav/.m4a/.aac`, ≤5 MB, 2-60 s);
`sound_insert_time`, `sound_start_time`, `sound_end_time` are in ms; `sound_volume` and
`original_audio_volume` are floats (default 1). Requires the source video to be 720p/1080p,
2-60 s, ≤100 MB. Prefer native audio generation over this path.

## 4. Pricing snapshot (per second of output, 720p/1080p)

| Model | Mode | 720p | 1080p |
| --- | --- | --- | --- |
| Kling 3.0 | no native audio | 0.6 u ($0.084) | 0.8 u ($0.112) |
| Kling 3.0 | native audio, no voice control | 0.9 u ($0.126) | 1.2 u ($0.168) |
| Kling 3.0 | motion control | 0.9 u | 1.2 u |
| Kling 3.0 | 4K | — | 3.0 u ($0.42) |
| Kling 2.6 | no native audio | 0.3 u ($0.042) | 0.5 u ($0.07) |
| Kling 2.6 | native audio + voice control | — | 1.2 u ($0.168) |
| Kling 2.5 Turbo | no native audio | 0.3 u | 0.5 u |
| Lip sync | per 5 s | 0.5 u | — |
| Text to audio | per call | 0.25 u | — |
| Video to audio | per call | 0.25 u | — |
| TTS | per call | 0.05 u | — |

Worked example: a 60 s vertical drama at 720p built as 6 multi-shot calls with no audio
(6 x 10 s x 0.6 = **36 units**), native speech added to two segments
(+2 x 10 s x 0.9 = **18 units**), six ambience cues (**1.5 units**), two BGM cues
(**0.5 units**) = **56 units**. Trial packages of 100 units cover this comfortably.

## 5. ffmpeg recipes

Every recipe below is verified working on ffmpeg 9.x. Use forward slashes or a shell array for
paths; avoid backslashes inside filtergraphs.

### Contact sheet (visual verification)

```bash
ffmpeg -y -i S1.mp4 -vf "fps=1,scale=300:534,tile=5x2" -frames:v 1 S1_sheet.png
```

`fps=1` = one frame per second; `tile=5x2` needs `fps x duration` tiles, so a 10 s clip with
`fps=1` fills 5x2 exactly. For a multi-segment overview, tile each input then combine with
`xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0`, or stack strips with `vstack`/`hstack`.

### Spectrogram (audio verification)

```bash
ffmpeg -y -i S1.mp4 -filter_complex "[0:a]showspectrumpic=s=1400x520:legend=1:scale=log[v]" \
  -map "[v]" -frames:v 1 spec.png
```

Without `-filter_complex ... -map "[v]"`, `-frames:v 1` grabs a **video** frame instead of the
spectrogram. Voiced speech = vertical striations (harmonics) in the low band.

### Normalise one clip to an exact canvas and duration

```bash
ffmpeg -y -i in.mp4 -t 10 \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30" \
  -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p out.mp4
```

### Concatenate

```bash
# video: concat demuxer with -c copy works when every part shares codec and parameters
printf "file '%s'\n" "$PWD"/build/S1.mp4 ... > build/list.txt
ffmpeg -y -f concat -safe 0 -i build/list.txt -c copy build/concat.mp4

# audio: always use the concat FILTER, never -c copy (AAC copy causes Non-monotonic DTS)
ffmpeg -y -i a1.m4a -i a2.m4a -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[a]" \
  -map "[a]" -ac 2 -ar 48000 -c:a aac -b:a 192k out.m4a
```

### Burn subtitles

```bash
ffmpeg -y -i concat.mp4 \
  -vf "subtitles=subs.srt:force_style='FontName=Microsoft JhengHei,FontSize=8,PrimaryColour=&H00FFFFFF,OutlineColour=&HB0000000,BorderStyle=1,Outline=1.6,Shadow=0.6,Alignment=2,MarginV=48'" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -an out.mp4
```

- The single quotes around the `force_style` value are mandatory.
- Use a **relative** path for the SRT (run ffmpeg with the project directory as cwd) so you avoid
  escaping the Windows drive-letter colon.
- `Alignment=2` bottom centre; `MarginV` = distance from the bottom in script units.
- `FontSize` and `MarginV` scale together, so shrink both when the user asks for smaller, lower
  subtitles.
- Confirm libass resolved the font by checking for a `fontselect:` line on the console.

### Title card

```bash
ffmpeg -y -f lavfi -i "color=c=black:s=1080x1920:r=30:d=1.5" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p title.mp4
```

Then let the subtitle pass render the title text over it — no `drawtext` font-path wrestling.

### Mix dialogue with ducked BGM

```bash
ffmpeg -y -i video.mp4 -i voice60.m4a -i bgm60.m4a -filter_complex "
[1:a]highpass=f=80,equalizer=f=280:t=q:w=1:g=-3,equalizer=f=3200:t=q:w=1.3:g=+4,\
acompressor=threshold=0.08:ratio=3:attack=8:release=180,asplit=2[voxA][voxB];
[2:a]volume=0.34[bgm];
[bgm][voxA]sidechaincompress=threshold=0.03:ratio=6:attack=12:release=380:makeup=1[bgmduck];
[voxB][bgmduck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=13,\
alimiter=limit=0.95,afade=t=out:st=57.5:d=2.5[out]" \
  -map 0:v:0 -map "[out]" -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest final.mp4
```

- `asplit` is required: a labelled output can be consumed only once, and the voice bed is needed
  twice (as sidechain and as a mix input).
- `sidechaincompress` takes `[main][sidechain]` and outputs the compressed **main** — so the BGM is
  the main and the voice is the sidechain.
- BGM base volume 0.3-0.35 sits clearly under dialogue; ducking handles the rest.
- `loudnorm` upsamples, so force `-ar 48000` on the output.

### Measurement

```bash
ffmpeg -hide_banner -i out.mp4 -af loudnorm=print_format=json -f null -   # input_i, input_tp, input_lra
ffmpeg -hide_banner -i out.mp4 -af volumedetect -f null -                 # mean_volume, max_volume
ffmpeg -hide_banner -ss 4 -t 3 -i out.mp4 -af volumedetect -f null -      # a window (dialogue)
```

Targets: integrated ≈ **-16 LUFS**, true peak **≤ -1.5 dB**, and dialogue windows measurably above
no-dialogue windows.

## 6. Colour-grade recipes

Two-colour language keeps the flashback legible as a flashback.

| Grade | Filter |
| --- | --- |
| Cool (flashback, night, exterior) | `eq=saturation=0.82:contrast=1.06,colorbalance=bs=0.16:bm=0.10:bh=0.04,curves=blue='0/0.06 0.5/0.56 1/1'` |
| Warm (present, interior) | `eq=saturation=1.04:contrast=1.04,colorbalance=rs=0.05:rm=0.03,curves=red='0/0.03 0.5/0.53 1/1'` |

`colorbalance` takes `r/g/b` plus a range letter: `s` shadows, `m` midtones, `h` highlights — so
`bs` blue shadows, `gm` green midtones, `rh` red highlights. There is no `ms` option; a typo there
aborts the whole render with `Option not found`.

Put a filter string in a segment's `grade` field in `production.json` and `assemble.js` applies it
during normalisation. Apply per segment, not to the finished master, so the boundary between looks
stays sharp.

## 7. Timing and duration bookkeeping

- Keep the plan's `start` values equal to the cumulative sum of segment durations. Subtitles are
  authored against that same timeline.
- If the last segment must yield room to a title card, trim it during assembly (e.g. 10 s segment →
  8.5 s) and add a 1.5 s card, so the total stays exactly 60.000 s.
- AI-generated shot boundaries are **not** frame-accurate to the planned multi-shot durations. Place
  subtitles by planned shot window, then fine-tune after watching the contact sheet.
- Verify the final container duration to the millisecond before delivering.
