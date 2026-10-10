# Prompt patterns

Copy these blocks and swap the bracketed parts. The ordering rules matter more than the wording.

## 1. Character note — always the first sentence

Anything the model must not lose goes first. Reuse the **same** block, verbatim, in every segment,
even if it feels repetitive. This is what holds a character together across independent
generations.

```
IMPORTANT CHARACTER NOTE: [the defining feature] must be clearly visible in every shot
[he/she] appears in. [Full character sheet]
```

Worked shape — fill in your own character sheet:

```
IMPORTANT CHARACTER NOTE: [the defining trait] must be clearly visible in every shot [pronoun]
appears in. [Character A: age, ethnicity, hair colour and style, eye colour, clothing, defining
prop]. [Character B: the same fields]. [Language constraint, if any]
```

The trait can be anything the model would otherwise drop — a scar, a uniform, a distinctive
tattoo, a prosthetic, or a non-human feature such as wings, horns or a tail.

Why the order matters: with the defining trait described mid-prompt, the first shots of the clip
came back without it; moving the note to the front fixed it on the next attempt. The model weights
the opening of the prompt heavily.

Add the language constraint here too when the segment has speech:

```
The two characters speak [language] only.
```

## 2. Style string — repeat in every shot

One string, identical across segments, is the cheapest consistency lever available.

```
cinematic photorealistic live-action, vertical 9:16, 35mm lens, shallow depth of field,
subtle film grain, NOT anime, NOT CGI
```

Guard phrases that stop close-ups drifting into stylisation. Include them on any shot whose subject
is a face:

```
Photorealistic live-action footage, a real human [actor/actress] wearing practical
[prosthetic/costume] [feature], natural skin texture with visible pores, shot on a 50mm lens,
documentary realism. NOT anime, NOT cartoon, NOT CGI, NOT illustration, NOT stylized.
```

This was necessary in practice: face close-ups came back as glossy anime/CGI while every other shot
in the same clip stayed photorealistic. The phrasing that caused it was "cute ... face close-up"
paired with a whimsical simile in the expression description — cute-face language pulls the model
toward stylisation.

## 3. Shot blocks

Structure: **subject + action + camera move + light.**

```
shot 1, 4, Low angle close on [surface/object]: [detail]. Camera slowly tilts up revealing
[character] [action]. [style string]; shot 2, 3, Reverse shot: [character B] [action].
[lighting], [style string]; shot 3, 3, [closing beat]. Static camera, [lighting], [style string]
```

Practical choices that paid off:

- Open with an object or a low angle and **tilt/reveal** the character — it delays the face by two
  seconds and makes the first frame legible as an image.
- Give one shot a strong comic object or animal behaviour; these read instantly even on mute.
- End the last segment on a direct-to-camera look, then cut to black. It is the cheapest rewatch
  hook there is.
- Longest shot first; keep any shot that carries the hook at ≥3 s.

## 4. Dialogue

```
shot 2, 3, Reverse shot: [man] stands frozen in the open doorway holding a plastic bag. He speaks
[language] in a calm, surprised young male voice, one short line: [line]. [Character] looks up at
him. [style string]
```

Rules:

- One short line per shot, ≤10 characters.
- Mark silence explicitly on every other shot: `No dialogue in this shot.`
- The speaker must be visible and reasonably facing camera in that shot.
- Prefer `settings.audio: "native"` so speech and mouth movement are generated together.

## 5. Ambience prompts

A literal list of sounds, ≤200 chars. Name concrete sources, not moods:

```
busy city street at midday, car tyres on wet asphalt, distant construction, pedestrians passing,
a shop door chime
```

```
a kitchen extractor fan running, a knife on a chopping board, oil sizzling in a pan, a kettle
coming to the boil, calm room tone
```

Send **only** `sound_effect_prompt` when a separate BGM layer is planned.

## 6. BGM prompts

Ask for restraint, not for a melody:

```
beautiful aesthetic cinematic background music, warm tender solo piano with soft strings pad,
gentle and romantic, slow tempo, no drums, no vocals, seamless ambient loop, very soft and
unobtrusive
```

```
beautiful aesthetic cinematic background music, melancholic soft piano with warm cello, cold
overcast mood, bittersweet and gentle, slow tempo, no drums, no vocals, seamless ambient loop, very
soft and unobtrusive
```

"No drums, no vocals, seamless ambient loop, very soft" is what makes a 10-second cue tile cleanly
underneath dialogue.

## 7. Subtitle copy

- Keep one line per subtitle; avoid two-line wraps at small font sizes.
- Match the speaker's actual words exactly when there is speech, so words and audio agree.
- For a silent lead, put all dialogue in the other character's mouth and let the lead's lines be
  narration-free — the visuals carry it.
- Author timing against the planned shot windows, then adjust after viewing the contact sheet.

## 8. Segment plan shape

Six 10-second segments is the sweet spot for 60 seconds: 3-4 shots per segment, one generation call
per segment, and a look per segment that can be graded independently.

| Segment | Shots | Look |
| --- | --- | --- |
| S1 hook | 3 | present, interior, warm |
| S2 cause (flashback) | 3 | past, exterior night, cool |
| S3 turn | 3 | present, night, high contrast |
| S4 montage | 4 | present, day, bright |
| S5 intimacy | 3 | present, warm |
| S6 resolution + button | 4 | present, night, warm |
