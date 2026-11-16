# Flow video ad profile

Copy this template to `docs/ai/flow-video-ad.md` in your repository and fill it in.

```markdown
# Flow video ad

## Product
- Name: <Product>
- Spoken as: <how prompts must write it so Flow pronounces it right>
- Dialogue language: <pt-BR>
- Logo: <path>
- URL and dates for the end card: <URL; where the current date or offer comes from>

## Folders
- Ads: <docs/ads/>                                  # one <NN>-<slug>/ folder per ad
- Safe recordings: <path/*.mp4>                     # masked, no captions
- How to regenerate them: <script or steps>
- Never use: <raw recordings path>                  # they show personal or customer data
- Scene timeline of the recordings: <path>

## Claims
- Sources of truth: <code and docs that confirm features, plans, and dates>
- Forbidden claims: <for example: the product chooses taxes; bulk actions it does not have>

## Character
- Name and reference image: <NAME>, <path or Flow ingredient name>
- CHARACTER block: <exact text>
- VOICE block: <exact text>
- SETTING block: <exact text>

## Edit
- Product area crop: <x and y ranges that hide navigation, plan, and account name>
- Footer during product screens: <text or none>
- Captions and end card style: <overrides, if any>

## Privacy
- Never visible: <tax IDs, company names, access keys, certificate holders, plan or account names>
```
