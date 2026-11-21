# Flow prompt template and steps

## Prompt per shot

Fill the `CHARACTER`, `VOICE`, and `SETTING` blocks from the profile and keep them identical in every prompt.

```
Vertical 9:16, <N> seconds, single continuous shot, cinematic realistic, natural skin texture, subtle film grain. No music. No text on screen, no subtitles, no logos anywhere.

CHARACTER — <NAME> (use the reference image): <appearance; accessories that stay on the whole shot; clothing>.
VOICE — <timbre, age, native language and accent, pace>, conversational and natural, medium volume, close microphone, not like a TV announcer.
SETTING: <place and time of day; furniture; generic laptop with no logo; props that stay where they are; lighting>.
LAPTOP SCREEN: flat, uniform, evenly lit chroma-key green, edge to edge, no reflections, no interface, no text.

START STATE: <framing and pose at 0 s>
ACTION (max 3): <1>; <2>; <3>
DIALOGUE: at <t> s she says in <dialogue language>, exactly: "<one sentence>". Then silence until the end of the shot.
END STATE: <framing and pose at the last frame>
CAMERA: <lens, height, movement>
AUDIO: quiet room ambience, <specific effects>; only her line as speech.
```

Adjust the pronouns to the character. For a full-green hold, replace START/ACTION/END with: `The entire frame is 100% solid chroma-key green, edge to edge, completely static for all <N> seconds, no camera movement, no change in color or brightness.` Then add the off-screen line.

## Steps for the user in Flow

Include these in the deliverable, adapted to the shots:

1. Open labs.google/fx/tools/flow, open the project, and check the credit balance.
2. If there is no reference image of the character yet, generate one (character sheet: front and three-quarter views, neutral light) and save it as an ingredient. Reuse it in every shot.
3. For each shot, in order:
   - choose **Ingredients to Video** with the reference image, or **Frames to Video** with the previous shot's last frame when the table says so;
   - set aspect ratio 9:16, the shot duration, and a model that generates audio;
   - **draft with the cheapest model and 1 output**; switch to the quality model only after the draft is approved;
   - paste the prompt exactly as written;
   - check with sound on: words and pronunciation, the voice matches earlier shots, accessories and props stay put, no invented text or logos, and the green is flat and full-frame where required;
   - download it and save it under the expected file name.
4. Credits come back only for failed or safety-blocked generations, not for bad results. If a shot fails twice for the same reason, stop and ask for a simpler shot instead of retrying.
5. Say when every file is in `flow/`.
