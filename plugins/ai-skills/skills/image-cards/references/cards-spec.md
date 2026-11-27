# Cards spec

A JSON file with a `cards` array. Paths are relative to the repository root (the directory `render.sh` runs from).

```json
{
  "cards": [
    {
      "id": "2026-12-01-recorrencia",
      "template": "headline",
      "formats": ["ig-portrait", "fb-landscape"],
      "kicker": "Fechamento do mês",
      "headline": "Emita todas as notas do mês num lote só",
      "highlight": "num lote só",
      "lead": "Filtre as recorrências pendentes, ajuste o valor e emita.",
      "image": "docs/screens/recorrencias.png",
      "image_label": "Tela real · dados fictícios",
      "alt": "Tela de recorrências pendentes com quatro clientes fictícios selecionados",
      "badge": "Beta grátis até 31/03/2027",
      "footer": "example.com",
      "lang": "pt-BR"
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | kebab-case; output files are `<id>-<format>.<ext>` |
| `formats` | yes | one or more of `ig-portrait`, `ig-square`, `story`, `fb-portrait`, `fb-landscape`, `yt-thumbnail` |
| `headline` | yes | main line; keep it under about 60 characters |
| `template` | no | `headline` (default: kicker, headline, lead, screenshot, footer), `statement` (large text on the primary color, no screenshot), `slide` (carousel slide with `index`/`total` counter), `thumbnail` (larger headline for YouTube) |
| `highlight` | no | part of the headline drawn in the primary color (last occurrence) |
| `kicker`, `lead` | no | line above and text below the headline |
| `image`, `image_label`, `alt` | no | real screenshot, its source label, and its description |
| `badge`, `footer` | no | pill on the right of the footer; footer text (default `brand.footer`) |
| `index`, `total` | no | slide counter for `slide` |
| `background` | no | `primary` puts any template on the primary color |
| `type` | no | `png` or `jpeg`, overriding the format's default |
| `logo` | no | `false` hides the brand logo |
| `lang` | no | page language (default `pt-BR`) |

Without `--profile`, a `brand` object in the spec itself sets colors, font, logo, and footer (same shape as the profile's `brand`).

A carousel is one card per slide (`template: "slide"`, same `formats`, `index` 1..n). Instagram carousels keep every slide at the same aspect ratio.
