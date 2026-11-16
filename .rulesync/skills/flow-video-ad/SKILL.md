---
name: flow-video-ad
description: >-
  Plan a short promotional or social-media video made with Google Flow (Veo)
  plus real screen recordings of the product: shot-by-shot script, ready-to-paste
  Flow prompts, and the step-by-step Flow procedure, then assemble the final
  video from the clips the user generates. Use when the user asks for an ad,
  reel, promo, or AI-generated video about their product, or wants to redo one.
---

# Flow video ad

The user pays Flow credits for every generation and is usually not a video editor. Get the ad right with as few generations as possible. Flow generates only the human and cinematic shots; real product screens are always composited from recordings, never generated.

## Profile

Read the project profile first. Default path: `docs/ai/flow-video-ad.md`; [references/profile-template.md](references/profile-template.md) lists its fields (product name and how to say it, languages, folders, claim sources, forbidden claims, character, voice, setting, screen crop, captions, end card, privacy rules). Without a profile, ask for the product name, the dialogue language, where the recordings are, and which claims must be checked, then offer to save the answers as a profile.

Speak to the user in their language. Write Flow prompts in English, with dialogue inside quotes in the profile's dialogue language.

## 1. Brief

Collect, asking only for what is missing:

- the feature to show (one feature per ad);
- audience and channel (default 9:16 for Instagram, TikTok, or WhatsApp);
- target length (default 25–35 s; never plan more than about 35 s);
- the recording that covers the feature and the exact time range on screen.

Use only the recordings the profile marks as safe (masked, without captions). Never use raw recordings that show personal or customer data; regenerate safe ones as the profile describes. Reuse the profile's character and reference image unless the user asks for someone else, and look at earlier ads in the ads folder.

## 2. Verify every claim

Before writing copy, confirm each product claim in the code or docs listed in the profile; do not trust memory. Respect the profile's forbidden claims. In general never promise savings in money or exact time, never say everything is "100% automatic", and never claim the product decides what only the user or a professional decides.

## 3. Shot plan

Build the ad from short, independent shots. Never ask Flow for one long continuous scene.

1. **One shot per generation, 4–8 s.** A bad shot is regenerated alone.
2. **At most 2–3 actions per shot.** With more, the scene falls apart.
3. **No risky prop handling:** no taking glasses off or on, no pouring, no handing objects over. Props stay put; the character looks, talks, types, or gestures.
4. **Defined start and end state** (position, framing, gaze). The next shot starts from that state; use **Frames to Video** with the previous shot's last frame when continuity matters.
5. **Speech:** at most one sentence per shot, about 2.3 words per second, and at least 1.5 s of silence at the end (Flow cuts speech that overruns). Prefer simple words, avoid close repeated syllables, and write the product name the way the profile says it is spoken.
6. **Screens use a green laptop.** The laptop screen is flat chroma-key green; the camera pushes in until green fills the frame, then holds. Match the hold to the footage range (footage plays at normal speed). The push-in is keyed with a perspective (corner-pin) warp, so the screen stays a trapezoid until it is frontal.
7. **No music from Flow.** Prompts say "no music"; add one royalty-free track in the edit.
8. **Voice consistency:** Flow does not keep a voice across generations. Repeat the identical `VOICE` block in every prompt, generate 2 options per talking shot, and pick the closest ones. Loudness can be fixed in the edit; timbre cannot.

Typical structure (adapt per feature):

| Shot | Duration | Content |
|---|---|---|
| S01 | 4–5 s | hook: the character to camera with the pain, one sentence |
| S02 | 3–4 s | turns to the laptop and types; push-in until the frame is fully green |
| S03 | = footage range | full-frame green hold; off-screen voice, one or two short sentences |
| S04 | 4–5 s | new angle: relief, one sentence to camera |
| S05 | 5–6 s | call to action, one short sentence (dates and URLs only on screen) |

Split a screen hold longer than 8 s into S03a/S03b, each its own full-green generation with its own sentence.

## 4. Deliverable

Create `<ads-folder>/<NN>-<slug>/ROTEIRO.md` (or the file name the profile sets) with:

1. the claim checks, one line per claim with its source file;
2. a shot table: shot, duration, Flow or real footage (file and time range), start state, end state, speech, on-screen caption (at most 7 words);
3. one prompt per shot from [references/prompt-template.md](references/prompt-template.md), filled with the profile's character, voice, and setting blocks;
4. the expected clip names: `<NN>-<slug>/flow/S01.mp4`, `S02.mp4`, …;
5. the Flow steps from the same reference, adapted to the shots.

## 5. Assembly

When the user says the clips are in `flow/`:

1. Probe each clip with `ffprobe` and transcribe it with `whisper-cli` in the dialogue language (keep the model in a temp folder). Report any wording that differs from the script.
2. Find the full-green windows and the green corners per frame. Key push-in shots with a corner-pin warp of the footage onto the screen quad until it is frontal and fills the frame.
3. Full-screen footage: crop to the profile's product area (hide navigation, plan, and account names), scale to 1080 px wide, on a blurred, darkened copy. Add smooth zooms that follow the action so text is readable on a phone.
4. Add the profile's footer during product screens, the dialogue captions (white on a 70% black box, centered around y ≈ 1400), the end card (logo, date, URL), and one music track ducked under the voice. Normalize to about −16 LUFS and match the loudness of every speech clip.
5. Render 1080×1920, 30 fps, H.264 CRF 18, AAC, `+faststart`, to `<NN>-<slug>/render/<slug>-vN.mp4`. Pass `-nostdin` to every ffmpeg call; avoid long split/overlay chains, and use `maskedmerge` for many masks.
6. Review sampled frames (transitions, zooms, captions, end card) before sending the file, and list any remaining Flow defects with the cheapest fix for each.

## Final checklist

- [ ] Every claim verified in code or docs; none of the profile's forbidden claims.
- [ ] No raw recordings; nothing from the profile's privacy list visible.
- [ ] No third-party or government logos; the video is labeled as AI-generated on each platform.
- [ ] Captions make sense with the sound off; the end card stays in the safe area (not in the top 250 px or the bottom 400 px).
