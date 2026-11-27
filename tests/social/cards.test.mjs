import assert from "node:assert/strict";
import { test } from "node:test";
import { brandFrom, buildPage, escapeHtml, FORMATS, validateCard } from "../../.rulesync/skills/image-cards/scripts/cards.mjs";
import { jobsFor } from "../../.rulesync/skills/image-cards/scripts/render-cards.mjs";
import { png, tempDir } from "./helpers.mjs";

test("formats cover every platform size", () => {
  const sizes = Object.fromEntries(Object.entries(FORMATS).map(([name, f]) => [name, `${f.w}x${f.h}:${f.type}`]));
  assert.deepEqual(sizes, { "ig-portrait": "1080x1350:jpeg", "ig-square": "1080x1080:jpeg", story: "1080x1920:jpeg", "fb-portrait": "1080x1350:png", "fb-landscape": "1200x630:png", "yt-thumbnail": "1280x720:jpeg", "li-landscape": "1200x627:png", "li-square": "1200x1200:png" });
});

test("pages escape text, inline images and fonts, and use brand colors", () => {
  const root = tempDir({ "shot.png": png(4, 4), "font.woff2": "font" });
  const brand = brandFrom({ brand: { colors: { primary: "#ff0000" }, font: { family: "Brand", files: ["font.woff2"] } } });
  const html = buildPage({ id: "a", headline: "Lote <script>x</script> só", highlight: "só", image: "shot.png", formats: ["story"] }, "story", brand, root);
  assert.ok(!html.includes("<script>x"));
  assert.match(html, /Lote &lt;script&gt;x&lt;\/script&gt; <span class="hl">só<\/span>/);
  assert.match(html, /src="data:image\/png;base64,/);
  assert.match(html, /@font-face\{font-family:"Brand";src:url\(data:font\/woff2;base64,/);
  assert.match(html, /\.hl\{color:#ff0000\}/);
  assert.match(html, /width:1080px;height:1920px/);
  assert.equal(escapeHtml(`"'&`), "&quot;&#39;&amp;");
});

test("spec validation lists every problem; jobs expand card x format", () => {
  assert.deepEqual(validateCard({ id: "Bad Id", template: "x", formats: ["nope"] }), ["card id must be kebab-case: Bad Id", "Bad Id: unknown template x", "Bad Id: headline is required", "Bad Id: unknown format nope (ig-portrait, ig-square, story, fb-portrait, fb-landscape, yt-thumbnail, li-landscape, li-square)"]);
  const jobs = jobsFor({ cards: [{ id: "a", headline: "h", formats: ["ig-portrait", "story"] }, { id: "b", headline: "h", formats: ["yt-thumbnail"] }] }, { only: "a" });
  assert.deepEqual(jobs.map((job) => job.format), ["ig-portrait", "story"]);
});
