---
name: ai-short-drama-production
description: Produce a finished vertical AI short drama video (typically 60 seconds) end to end using the Kling API plus ffmpeg — story structure, multi-shot generation plans, cross-segment character consistency, native-language dialogue with lip sync, ambience and BGM design with sidechain ducking, subtitle burn-in, and loudness normalization. Use when the user asks for an AI short drama, AI 短劇, AI 微短劇, 生成影片, AI 影片製作, vertical micro-drama, or wants a scripted story turned into a generated video.
---

# AI Short Drama Production

Turn a written story into a finished, platform-ready vertical video using a generative video API
and ffmpeg. This skill covers the whole chain: planning, paid generation, audio design,
assembly, verification, and delivery.

Throughout this document **`<skill>` means this skill's base directory** — the path reported in the
skill-resources block when the skill loads (typically
`~/.agents/skills/ai-short-drama-production`). The bundled scripts have no npm dependencies and
print their status messages in Chinese.

## Quick start

```bash
mkdir my-drama && cd my-drama
cp <skill>/production-template.json production.json     # then edit the prompts
export KLING_API_KEY='api-key-kling-...'                # or write ./.kling.key

node <skill>/scripts/kling-gen.js --check      # free: key + remaining units
node <skill>/scripts/kling-gen.js --dry-run    # free: shot sums, prompt lengths, cost
node <skill>/scripts/kling-gen.js --test S1    # generate ONE segment, then look at it
node <skill>/scripts/kling-gen.js --all        # the rest (long: run as a background job)
node <skill>/scripts/kling-ambience.js         # pure SFX layer
node <skill>/scripts/kling-bgm.js              # BGM cues
node <skill>/scripts/assemble.js               # normalise + concat + burn subtitles
node <skill>/scripts/final-mix.js              # voice EQ + ducked BGM + loudness
```

Then verify (Phase 6) and deliver (Phase 7). Every script resolves the project from the **current
working directory**, so run them from inside the project.

## What you produce

| Artifact | Notes |
| --- | --- |
| `output/<title>_<n>s.mp4` | Final master, vertical (1080x1920 default), burned subtitles, mixed audio |
| `production.json` | The plan: every prompt, every setting. Idempotent and re-runnable |
| `state.json` | Task ledger so a re-run never re-bills finished segments |
| `subs.srt` | Subtitles (also uploaded separately by the user if they prefer) |
| `clips/`, `build/` | Per-segment source and intermediate files, kept for re-edits |

## Non-negotiable rules

1. **The API key includes its `api-key-` prefix.** A Kling key looks like
   `api-key-kling-<43 chars>`. Stripping the `api-key-` part produces `401 code 1002`
   ("does not support AK/SK" / "token expected to have 3 parts"). Never trim it.
2. **Never spend credits before a free check and a dry run.** `--check` verifies the key and
   reads the remaining resource-package units for free (`GET /account/costs`).
3. **Generate ONE segment first, look at it, then generate the rest.** A 6-unit probe prevents
   wasting 50 units on a wrong look.
4. **Always keep `state.json`.** Generation is async and slow; resuming is the normal case,
   and blind re-submission double-bills.
5. **Verify visually before delivering.** You cannot watch video or hear audio. Extract contact
   sheets and spectrograms and actually look at them (see Phase 6).

## Prerequisites

- A Kling API key with a purchased resource package (trial packages work). Console:
  <https://kling.ai/dev/api-key> ; pricing: <https://kling.ai/dev/pricing?scrollTo=video>
- Node.js 18+ (no npm dependencies — the bundled scripts use only `https`, `fs`, `child_process`)
- ffmpeg + ffprobe. If missing, run `node scripts/get-ffmpeg.js` to fetch a static build
  (Windows: gyan.dev essentials, ~110 MB, includes libx264/aac/libass). On Windows you can
  also `winget install Gyan.FFmpeg`.
- Work in a dedicated project directory. Every script reads the plan from the **current working
  directory**, so `cd` into the project first.

Key lookup order used by all scripts: `$KLING_API_KEY`, then `./.kling.key` in the project, then
`~/.kling.key`. Prefer the env var; never put the key on a command line. The scripts resolve
ffmpeg via `$FFMPEG`, then `./tools` / `../tools`, then the system `PATH`.

---

## Phase 1 — Story design

Work at **60 seconds total** unless told otherwise. Structure that reliably holds retention:

| Time | Beat | Purpose |
| --- | --- | --- |
| 0-10s | **Hook** — the single most visual, unexplained image of the premise | Stop the scroll |
| 10-20s | Flashback / cause, contrasting colour grade | Explain the premise |
| 20-30s | The turn (the reveal) | Pay off the hook |
| 30-40s | Comedic or behavioural montage, brightest look | Entertainment |
| 40-50s | Quiet intimate beat | Earn the emotion |
| 50-58.5s | Resolution + a button/gag in the last beat | Satisfaction + rewatch |
| 58.5-60s | Black title card | Branding |

Rules that matter:

- **Show the premise in the first 3 seconds.** Do not build up to it.
- **Two-colour language.** Give the flashback one grade (e.g. cool blue) and the present another
  (warm amber). Never let them look the same.
- **Decide deliberately whether characters speak.** Dialogue is the single largest quality risk.
  A silent lead plus 3-5 short lines from one character is far safer than a talking ensemble — and
  it removes lip-sync failure modes entirely. Only add speech when the user asks for it.
- Restrict dialogue to short lines (≤10 characters per line) spoken by **one** character, placed
  where that character is visibly on screen and facing camera in that shot.
- Write the SRT in the same pass so timing and lines stay in sync.

## Phase 2 — The generation plan

Copy `production-template.json` into the project as `production.json` and fill it in. Structure:

```json
{
  "model": "kling-3.0",
  "endpoint": "/text-to-video/kling-3.0",
  "settings": { "resolution": "720p", "aspect_ratio": "9:16", "duration": 10,
                "audio": "off", "multi_shot": true },
  "segments": [
    { "id": "S1", "title": "...", "look": "present / interior / warm", "start": 0.0,
      "prompt": "shot 1, 4, ...; shot 2, 3, ...; shot 3, 3, ..." }
  ]
}
```

**Segment = one API call.** Because Kling 3.0 supports multi-shot prompts, put 3-6 shots in a
single 10-second generation instead of calling once per shot. Six calls cover 60 seconds, versus
14+ for one-call-per-shot, and shots generated together stay more consistent with each other.

Multi-shot prompt syntax (Kling 3.0 only — 2.6 and earlier are single-shot, 5 or 10 s):

```
shot 1, 4, <description>; shot 2, 3, <description>; shot 3, 3, <description>
```

- `n` = shot number, `m` = that shot's seconds. **The sum of all `m` must equal
  `settings.duration`** or the call fails.
- Max 6 shots. Per-shot text ≤512 chars; total prompt ≤3072 (stay under 2500).
- Longest shot first reads best; keep the hook shot ≥3 s.

Verify the arithmetic before spending anything:

```bash
node <skill>/scripts/kling-gen.js --dry-run
```

It prints per-segment shot counts, the duration sum, prompt length, per-segment audio mode, and
the projected unit cost.

### Prompt construction

Three blocks, in this order — the order is load-bearing:

1. **Character note first.** Anything the model must not lose — a defining physical trait, a
   costume, a prop the character always carries — goes in the first sentence. Features described
   only mid-prompt get dropped: in testing, a trait placed in the middle of the prompt was absent
   from the first shots of a clip, and moving the note to the front fixed it immediately.
2. **One style string, repeated in every shot**, e.g. `cinematic photorealistic live-action,
   vertical 9:16, 35mm lens, shallow depth of field, subtle film grain, NOT anime, NOT CGI`.
3. **Shot descriptions** with subject, action, camera move, and light.

Character consistency across independently generated segments comes from **restating the full
character sheet verbatim in every segment's prompt** (age, ethnicity, hair colour and style,
fringe, eye colour, clothing, plus any non-human features). Do not shorten it for later segments.

See `examples/prompt-patterns.md` for reusable phrasings, including the guard phrases that keep
close-ups from drifting into anime/CGI.

## Phase 3 — Paid generation

```bash
cd <project>
node <skill>/scripts/kling-gen.js --check      # free: key + remaining units
node <skill>/scripts/kling-gen.js --dry-run    # free: validates the plan
node <skill>/scripts/kling-gen.js --test S1    # one segment only — look at it
node <skill>/scripts/kling-gen.js --all        # everything; skips segments already on disk
```

- Generation is asynchronous: submit, poll (`GET /tasks?task_ids=`), download. A 10 s segment
  typically takes 1-5 minutes. `--all` can run 20-40 minutes; run it as a background job.
- Downloads land in `clips/<ID>.mp4`. `--status` and `--download` recover a crashed run.
- To regenerate one segment: delete its entry from `state.json` and its `clips/<ID>.mp4`,
  then re-run. Keep the old file as a backup so you can revert.

### Speech and lip sync

If the story needs spoken dialogue, **do not** post-process it with a separate TTS step if you can
avoid it. Set `"audio": "native"` on the segments that contain speech and write the lines into the
prompt in the target language, marked as one short line:

```
shot 2, 3, Reverse shot: <character B> <action>. He speaks <language> in a calm, surprised young
male voice, one short line: <line>. <character A> looks up ...
```

The model then generates the speech and the matching mouth movement together. Notes:

- `native` costs more than `off` (see the pricing table in `reference.md`) and may force 1080p on
  some models.
- Add `The two characters speak <language> only.` to the character note.
- Explicitly write `No dialogue in this shot.` for shots that must stay silent, otherwise the model
  may invent speech.
- Per-segment override: put `"audio": "native"` inside the segment object; `kling-gen.js` honours
  it over the global setting.
- The dedicated TTS endpoint (`POST /v1/audio/tts`) and the lip-sync endpoints
  (`/v1/videos/identify-face` → `/v1/videos/advanced-lip-sync`) exist, but the TTS voice library is
  account-gated — submissions can accept and then fail at processing. Try it only if native audio
  is unavailable, and verify with a single cheap line before building a pipeline on it.
- Practical caveat: you cannot listen. Verify speech exists via a spectrogram (Phase 6), and tell
  the user plainly that pronunciation and voice quality need their ears.

## Phase 4 — Audio design

Build three independent layers, then mix. Do not bake music into the ambience layer if you also
plan a BGM layer — two music beds fight.

| Layer | Source | Script |
| --- | --- | --- |
| Dialogue + on-set sound | The generated clips themselves (`audio: native`) | extracted during mixing |
| Ambience / SFX | `POST /v1/audio/video-to-audio` **with only `sound_effect_prompt`** | `kling-ambience.js` |
| BGM | `POST /v1/audio/text-to-audio` (3-10 s per call, loop it) | `kling-bgm.js` |

```bash
node <skill>/scripts/kling-ambience.js   # pure SFX for the silent segments
node <skill>/scripts/kling-bgm.js        # beautiful, unobtrusive BGM beds
```

Ambience prompts are literal lists of sounds, not moods: `busy city street at midday, car tyres on
wet asphalt, distant construction, pedestrians passing, a shop door chime`. BGM prompts should
demand restraint: `beautiful cinematic background music, warm tender solo piano with soft strings,
gentle, slow tempo, no drums, no vocals, seamless ambient loop, very soft and unobtrusive`.

Because `text-to-audio` caps at 10 s, generate one track per mood and tile it with
`-stream_loop -1 -t <seconds>`. One cue for the contrasting (flashback) look plus one for the rest
is usually enough.

## Phase 5 — Assembly

```bash
node <skill>/scripts/assemble.js    # normalise -> concat -> burn subtitles -> output
node <skill>/scripts/final-mix.js   # voice EQ + ducked BGM -> mux into the video
```

`assemble.js` does, per segment: scale+pad to the target canvas, `setsar=1`, force the frame rate,
and **trim to the planned duration** so the timeline is exact rather than however long the model
happened to render. Then it concatenates, appends a generated black title card, and burns
`subs.srt`. Trim the last segment to leave room for the title card so the total is exact.

Subtitle styling lives in `SUB_STYLE` inside `assemble.js`:

- `FontSize` controls size; `MarginV` controls height above the bottom (`Alignment=2` = bottom
  centre). Smaller font + small `MarginV` = small text pinned near the bottom edge.
- Chinese needs a font libass can resolve. `Microsoft JhengHei` (Traditional) works on Windows and
  libass reports the resolved face on the console — check that line, because a missing font renders
  as boxes. The script falls back to a subtitle-free master rather than failing.
- **The `force_style` value must be wrapped in single quotes** inside the filter string, otherwise
  its commas are parsed as filter separators and ffmpeg aborts with
  `Error parsing a filter description`.

`final-mix.js` builds the voice/ambience bed from the clips (boosting any segment whose speech
measured quieter), tiles the BGM, then mixes with `sidechaincompress` so the music automatically
ducks under dialogue — this is what keeps BGM from covering other sound. It finishes with
`loudnorm=I=-16:TP=-1.5` for platform-standard loudness.

## Phase 6 — Verification (do not skip)

You cannot watch or listen to the result. Convert it into something you can look at.

**Contact sheet per segment** — sample one frame per second into a grid, then read the image:

```bash
ffmpeg -y -i clips/S1.mp4 -vf "fps=1,scale=300:534,tile=5x2" -frames:v 1 clips/S1_sheet.png
```

Check: does each shot match its description, are the character's defining features visible *in the
shot that needs them*, is the look photorealistic rather than drifting to anime/CGI.

**Spectrogram of audio** — confirms speech/ambience actually exist. The audio stream must be
mapped explicitly or ffmpeg silently emits a video frame instead:

```bash
ffmpeg -y -i clips/S1.mp4 -filter_complex "[0:a]showspectrumpic=s=1400x520:legend=1:scale=log[v]" \
  -map "[v]" -frames:v 1 clips/spec_S1.png
```

Voiced speech shows as vertical striations (glottal harmonics) in the low band; broadband haze is
ambient noise or room tone.

**Loudness and peaks**:

```bash
ffmpeg -hide_banner -i out.mp4 -af loudnorm=print_format=json -f null -
ffmpeg -hide_banner -i out.mp4 -af volumedetect -f null -
```

Target integrated ≈ -16 LUFS, true peak ≤ -1.5 dB. Measure a dialogue window and a no-dialogue
window separately to confirm dialogue sits above the bed.

**Container sanity**: duration must equal the target to the millisecond, resolution/fps as
planned, and the audio stream present (`ffprobe -show_entries stream=codec_type,...`).

### Sandbox note

Under a restricted harness, `child_process` calls that capture output through pipes fail with
`EPERM`. Use `stdio: 'inherit'` (the bundled scripts do) and run measurement commands from the
shell rather than from Node. Never conclude a file is broken because a Node-side measurement
returned null.

## Phase 7 — Delivery

Write to the user's requested directory (outside the workspace requires one escalated operation)
and include:

- the final master, plus a no-audio master if the first mix is still under review
- the six source clips, the ambience and BGM source files
- `production.json`, `state.json`, `subs.srt`, and all scripts
- a short production note: what was generated, unit cost, what was verified, what was not
- verification images (contact sheet, spectrogram, subtitle sample)

Report cost honestly against the resource package, and state explicitly what you could not verify
(on-screen pronunciation, whether the BGM is aesthetically right for them).

---

## Cost model

Billing is per second of rendered video, in resource-package units. Always confirm the live table
at <https://kling.ai/document-api/pricing/base/video> — the snapshot in `reference.md` is a
guide, not a contract. Order-of-magnitude planning for 60 s at 720p:

| Path | Units | Notes |
| --- | --- | --- |
| Multi-shot, no audio, 6 calls | ~36 | Cheapest sane baseline |
| + native speech on 2 segments | +18 | 9 units per 10 s segment |
| Ambience, 6 cues | ~1.5 | 0.25 per call |
| BGM, 2 cues | 0.5 | 0.25 per call |

Budget checks that keep spend small: `--check` (free) → `--dry-run` (free) → one test segment →
the rest. Regenerating a single segment is the normal repair action, so plan for it.

## Common failures and fixes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `401 code 1002`, "does not support AK/SK" or "token expected to have 3 parts" | `api-key-` prefix stripped, or an AK/SK-style JWT sent to the new API | Send the full key as `Authorization: Bearer api-key-kling-...` |
| `Voice id not found` on TTS | Voice IDs are language-scoped and account-gated | Use `audio: native` in the video call instead |
| Close-up shots look anime/CGI | "cute face close-up" phrasing pulls the model toward stylisation | Add `photorealistic live-action, real human, natural skin texture, NOT anime, NOT cartoon, NOT CGI, NOT illustration` |
| A defining feature is invisible in early shots | Feature described mid-prompt | Move the character note to the **start** of the prompt |
| `Non-monotonic DTS` / clicks at joins | Concatenating AAC with `-c copy` | Concatenate with the `concat` **filter** (`concat=n=...:v=0:a=1`) |
| `Stream specifier 'X' matches no streams` | One filter output label fed into two consumers | Insert `asplit=2[a][b]` |
| Output audio is 96 kHz | `loudnorm` upsamples | Force `-ar 48000 -ac 2` on the output |
| `Error parsing a filter description` on `subtitles` | Unquoted commas in `force_style` | Wrap the value: `force_style='FontName=...,FontSize=8'` |
| Subtitles render as boxes | libass cannot resolve the font | Check the `fontselect:` line on the console; use an installed CJK family |
| Re-running re-charges for finished work | Missing/stale `state.json` | Restore the ledger; the scripts skip segments whose file exists |
| `spawnSync ... EPERM` inside Node | Sandbox blocks piped stdio | `stdio: 'inherit'`, measure from the shell |

## Bundled files

| Path | Purpose |
| --- | --- |
| `scripts/get-ffmpeg.js` | Download a static ffmpeg build when none is present |
| `scripts/kling-gen.js` | Key check, dry run, submit, poll, download, resume |
| `scripts/kling-ambience.js` | Pure SFX layer via video-to-audio (no BGM) |
| `scripts/kling-bgm.js` | BGM cues via text-to-audio |
| `scripts/assemble.js` | Normalise, concat, title card, burn subtitles |
| `scripts/final-mix.js` | Voice EQ, ducked BGM, loudness normalisation, mux |
| `production-template.json` | Starting point for the generation plan |
| `reference.md` | Endpoint, parameter and pricing reference; prompt and grade recipes |
| `examples/prompt-patterns.md` | Reusable prompt blocks |
