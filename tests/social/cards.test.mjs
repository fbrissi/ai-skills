import assert from "node:assert/strict";
import { test } from "node:test";
import { brandFrom, buildPage, escapeHtml, FORMATS, layoutCheck, validateCard } from "../../.rulesync/skills/image-cards/scripts/cards.mjs";
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

test("cards without an image center a larger composition instead of leaving the bottom blank", () => {
  const brand = brandFrom({});
  const story = buildPage({ id: "s", template: "statement", headline: "Em 07/12/2026, o layout nacional muda", lead: "Link na bio.", formats: ["story"] }, "story", brand);
  assert.match(story, /class="canvas statement on-primary solo"/);
  assert.match(story, /<div class="safe"><div class="grow"><\/div><h1>.*<\/h1><p class="lead">Link na bio\.<\/p><div class="grow"><\/div><\/div>/);
  assert.match(story, /\.solo h1\{font-size:119px;line-height:1\.04\}/);
  const shot = buildPage({ id: "s", headline: "h", image: "shot.png", formats: ["story"] }, "story", brand, tempDir({ "shot.png": png(4, 4) }));
  assert.doesNotMatch(shot, /class="canvas[^"]*solo/);
  assert.doesNotMatch(buildPage({ id: "t", template: "thumbnail", headline: "h", formats: ["yt-thumbnail"] }, "yt-thumbnail", brand), /class="canvas[^"]*solo/);
});

test("image_focus crops the screenshot to a region drawn at its own size", () => {
  const root = tempDir({ "shot.png": png(2880, 1800) });
  const brand = brandFrom({});
  const html = buildPage({ id: "c", headline: "h", image: "shot.png", image_focus: { x: 400, y: 300, w: 1200, h: 900 }, formats: ["ig-portrait"] }, "ig-portrait", brand, root);
  const svg = Buffer.from(/class="shot" src="data:image\/svg\+xml;base64,([^"]+)"/.exec(html)[1], "base64").toString();
  assert.match(svg, /^<svg [^>]*width="1200" height="900" viewBox="400 300 1200 900"><image [^>]*href="data:image\/png;base64,[^"]+" x="0" y="0" width="2880" height="1800"\/><\/svg>$/);
  assert.throws(() => buildPage({ id: "c", headline: "h", image: "shot.png", image_focus: { x: 2000, y: 0, w: 1200, h: 900 }, formats: ["ig-portrait"] }, "ig-portrait", brand, root), /image_focus goes past the image \(2880x1800\)/);
  assert.deepEqual(validateCard({ id: "c", headline: "h", formats: ["story"], image_focus: { x: 0, y: 0, w: 0 } }), ["c: image_focus needs an image", "c: image_focus must be {x, y, w, h} in image pixels"]);
});

/** Minimal DOM for layoutCheck: rects by selector, an optional screenshot with its natural width. */
function fakeDom({ safe, elements, shot = null }) {
  const rect = (top, bottom, left = 96, right = 984) => ({ top, bottom, left, right, height: bottom - top, width: right - left });
  const els = elements.map(([className, top, bottom]) => ({ className, tagName: "P", scrollWidth: 0, clientWidth: 0, getBoundingClientRect: () => rect(top, bottom) }));
  const shotEl = shot ? { className: "shot", tagName: "IMG", naturalWidth: shot.natural, scrollWidth: 0, clientWidth: 0, getBoundingClientRect: () => rect(shot.top, shot.bottom, 96, 96 + shot.width) } : null;
  globalThis.document = {
    querySelector: (selector) => (selector === ".safe" ? { getBoundingClientRect: () => rect(safe[0], safe[1]) } : selector === ".safe .shot" ? shotEl : null),
    querySelectorAll: () => [...els, ...(shotEl ? [shotEl] : [])],
    body: {},
    fonts: [],
  };
  globalThis.getComputedStyle = () => ({ fontFamily: "system-ui" });
}

test("layout check warns on a mostly blank safe area and on screenshots too small to read", () => {
  try {
    fakeDom({ safe: [250, 1520], elements: [["kicker", 250, 290], ["h1", 310, 640], ["lead", 660, 760], ["foot", 1480, 1520]] });
    assert.deepEqual(layoutCheck(), ["57% of the safe area is blank (y 760-1480): balance the composition, use larger type, or add a cropped real screenshot"]);
    fakeDom({ safe: [250, 1520], elements: [["kicker", 610, 650], ["h1", 670, 1000], ["lead", 1020, 1120], ["foot", 1480, 1520]] });
    assert.deepEqual(layoutCheck(), []);
    fakeDom({ safe: [96, 1254], elements: [["h1", 96, 300], ["foot", 1214, 1254]], shot: { top: 320, bottom: 1190, width: 888, natural: 2880 } });
    assert.deepEqual(layoutCheck(), ["screenshot drawn at 31% of its 2880px width: its UI text is too small to read on a phone; crop it to the relevant region with image_focus (at most about 1480px wide)"]);
    fakeDom({ safe: [96, 1254], elements: [["h1", 96, 300], ["foot", 1214, 1254]], shot: { top: 320, bottom: 1190, width: 888, natural: 1200 } });
    assert.deepEqual(layoutCheck(), []);
  } finally {
    delete globalThis.document;
    delete globalThis.getComputedStyle;
  }
});
