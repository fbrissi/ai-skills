# Video spec

A JSON file per video. Paths are relative to the repository root (the directory the scripts run from).

```json
{
  "id": "2026-12-03-recorrencia",
  "voice": "pt_BR-faber-medium",
  "length_scale": 0.92,
  "music": ".cache/video-shorts/music/city-sunshine.mp3",
  "footnote": "Telas reais com dados fictícios",
  "scenes": [
    { "id": "hook", "kind": "hook", "title": "Todo mês, a mesma nota?", "highlight": "a mesma nota?", "voice": "Todo mês, a mesma nota para o mesmo cliente?" },
    { "id": "config", "kind": "screen", "headline": "Configure uma vez", "image": "docs/screens/recorrencia.png", "focus": { "x": 320, "y": 180, "w": 640, "h": 400 }, "pan_to": { "x": 320, "y": 480, "w": 640, "h": 300 }, "label": "Tela real · dados fictícios", "voice": "Configure a recorrência uma vez." },
    { "id": "lote", "kind": "footage", "headline": "Emita o lote", "video": "docs/recordings/lote.mp4", "from": 3.2, "to": 9.5, "crop": "1024:538:256:112", "label": "Tela real · dados fictícios", "voice": "No fechamento, emita todas de uma vez." },
    { "id": "cta", "kind": "cta", "title": "Teste grátis", "body": "Sem cartão de crédito.", "url": "example.com", "voice": "Acesse example ponto com.", "say": "Acesse exêmpou ponto com." }
  ]
}
```

| Scene field | Kinds | Meaning |
|---|---|---|
| `id`, `kind` | all | unique id; `hook`, `screen`, `footage`, `statement`, `cta` |
| `voice` | all | the spoken line and its captions (hook and CTA show no captions) |
| `say` | all | pronunciation spelling read by Piper instead of `voice` |
| `title`, `highlight` | hook, statement, cta | large text; `highlight` colors its last occurrence (hook) |
| `body` | statement, cta | second line |
| `headline` | screen, footage | line above the screen |
| `image`, `focus`, `pan_to` | screen | real screenshot; camera boxes in image pixels (start, end) |
| `video`, `from`, `to`, `crop` | footage | real recording or supplied clip, cut in seconds, optional ffmpeg crop `w:h:x:y` that removes account names or navigation |
| `label` | screen, footage | source chip ("Tela real · dados fictícios", "Clipe gerado com IA") |
| `synthetic` | footage | `true` for realistic AI-generated footage (sets `synthetic_media`) |
| `min_seconds` | all | longer hold for a scene |

`render.mjs` refuses a `screen` without `image`, a `footage` without `video`, missing files, and any scene with `generated_ui`.

## Timing

Each scene lasts the longest of: its minimum (hook 2.4 s, screen 4 s, footage 3.5 s, statement 3.5 s, CTA 5.5 s + 0.6 s hold), the voice plus 0.25 s lead (0.1 s on the hook) and 0.5 s tail, or the footage clip at up to 2x speed. Without generated narration, timing assumes 2.6 words per second.

## Audio

Music plays at about 18% between lines and ducks to about 7% under the voice with 8-frame ramps, fading in over 0.6 s and out over 1.5 s. The final mix is normalized to −16 LUFS integrated (true peak −1.5 dB) with a two-pass `loudnorm`.

## Safe area

The 1080x1920 layout keeps text out of the top 250 px and bottom 400 px, where Shorts and Reels draw their buttons and captions.
