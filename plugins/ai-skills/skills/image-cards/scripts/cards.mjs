// HTML/CSS card templates. Pure functions: a card spec plus brand values in, one self-contained HTML page out
// (fonts and images inlined as data URLs, so rendering works offline).
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

export const FORMATS = {
  "ig-portrait": { w: 1080, h: 1350, safe: [96, 96, 96, 96], type: "jpeg", scale: 1 },
  "ig-square": { w: 1080, h: 1080, safe: [80, 88, 80, 88], type: "jpeg", scale: 0.9 },
  story: { w: 1080, h: 1920, safe: [250, 90, 400, 90], type: "jpeg", scale: 1.1 },
  "fb-portrait": { w: 1080, h: 1350, safe: [96, 96, 96, 96], type: "png", scale: 1 },
  "fb-landscape": { w: 1200, h: 630, safe: [56, 64, 56, 64], type: "png", scale: 0.62, row: true },
  "yt-thumbnail": { w: 1280, h: 720, safe: [56, 64, 56, 64], type: "jpeg", scale: 0.8, row: true },
  "li-landscape": { w: 1200, h: 627, safe: [56, 64, 56, 64], type: "png", scale: 0.62, row: true },
  "li-square": { w: 1200, h: 1200, safe: [88, 96, 88, 96], type: "png", scale: 0.95 },
};

export const TEMPLATES = ["headline", "statement", "slide", "thumbnail"];

export const DEFAULT_BRAND = {
  colors: { background: "#f5f7fa", ink: "#14213d", primary: "#2d5bab", on_primary: "#ffffff", accent: "#2a7d45", muted: "#4a5d78" },
  font: { family: "system-ui", files: [] },
  logo: null,
  footer: null,
};

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf" };

export class CardError extends Error {}

export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function dataUrl(path, root) {
  const full = resolve(root, path);
  if (!existsSync(full)) throw new CardError(`file not found: ${path}`);
  const mime = MIME[extname(full).toLowerCase()];
  if (!mime) throw new CardError(`unsupported file type: ${path}`);
  return `data:${mime};base64,${readFileSync(full).toString("base64")}`;
}

export function brandFrom(config) {
  const brand = config?.brand ?? {};
  return {
    colors: { ...DEFAULT_BRAND.colors, ...(brand.colors ?? {}) },
    font: { ...DEFAULT_BRAND.font, ...(brand.font ?? {}) },
    logo: brand.logo ?? null,
    footer: brand.footer ?? null,
  };
}

function highlight(text, phrase) {
  const safe = escapeHtml(text);
  if (!phrase) return safe;
  const target = escapeHtml(phrase);
  const at = safe.lastIndexOf(target);
  return at < 0 ? safe : `${safe.slice(0, at)}<span class="hl">${target}</span>${safe.slice(at + target.length)}`;
}

function fontFaces(font, root) {
  return (font.files ?? [])
    .map((file) => {
      const entry = typeof file === "string" ? { path: file } : file;
      return `@font-face{font-family:"${escapeHtml(font.family)}";src:url(${dataUrl(entry.path, root)});font-weight:${entry.weight ?? "100 900"};font-style:${entry.style ?? "normal"};font-display:block}`;
    })
    .join("\n");
}

function css(brand, format, root) {
  const c = brand.colors;
  const s = format.scale;
  const px = (value) => `${Math.round(value * s)}px`;
  return `${fontFaces(brand.font, root)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${c.background}}
body{font-family:"${brand.font.family}",system-ui,sans-serif;color:${c.ink};-webkit-font-smoothing:antialiased}
.canvas{position:relative;overflow:hidden;width:${format.w}px;height:${format.h}px;background:${c.background}}
.canvas.on-primary{background:${c.primary};color:${c.on_primary}}
.safe{position:absolute;top:${format.safe[0]}px;right:${format.safe[1]}px;bottom:${format.safe[2]}px;left:${format.safe[3]}px;display:flex;flex-direction:column;gap:${px(32)}}
.row .safe{flex-direction:row;align-items:center;gap:${px(56)}}
.col{display:flex;flex-direction:column;gap:${px(28)};min-width:0;flex:1 1 0}
.logo{height:${px(56)};width:auto;align-self:flex-start}
.kicker{font-size:${px(30)};font-weight:700;color:${c.primary};text-transform:none}
.on-primary .kicker{color:${c.on_primary};opacity:.85}
h1{font-size:${px(78)};line-height:1.06;font-weight:800;letter-spacing:-.02em;text-wrap:balance}
.statement h1{font-size:${px(96)}}
.thumbnail h1{font-size:${px(104)};line-height:1.02}
.hl{color:${c.primary}}
.on-primary .hl{color:${c.accent}}
.lead{font-size:${px(34)};line-height:1.36;color:${c.muted};text-wrap:pretty}
.on-primary .lead{color:${c.on_primary};opacity:.9}
.stage{position:relative;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center}
.row .stage{flex:1.2 1 0;align-self:stretch}
.shot{max-width:100%;max-height:100%;object-fit:contain;border-radius:${px(18)};box-shadow:0 ${px(18)} ${px(48)} rgba(0,0,0,.16);background:#fff}
.shot-label{position:absolute;bottom:${px(-6)};left:50%;transform:translate(-50%,100%);font-size:${px(20)};color:${c.muted};white-space:nowrap}
.grow{flex:1 1 auto}
.foot{display:flex;justify-content:space-between;align-items:center;gap:${px(24)};font-size:${px(28)};font-weight:700}
.badge{background:${c.accent};color:#fff;border-radius:999px;padding:${px(10)} ${px(24)};font-size:${px(24)}}
.counter{font-size:${px(26)};font-weight:700;color:${c.muted}}
.on-primary .counter{color:${c.on_primary}}`;
}

export function validateCard(card) {
  const errors = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(card.id ?? "")) errors.push(`card id must be kebab-case: ${card.id}`);
  if (!TEMPLATES.includes(card.template ?? "headline")) errors.push(`${card.id}: unknown template ${card.template}`);
  if (!card.headline) errors.push(`${card.id}: headline is required`);
  for (const format of card.formats ?? []) if (!FORMATS[format]) errors.push(`${card.id}: unknown format ${format} (${Object.keys(FORMATS).join(", ")})`);
  if (!(card.formats ?? []).length) errors.push(`${card.id}: formats is required`);
  return errors;
}

export function buildPage(card, formatName, brand, root = process.cwd()) {
  const format = FORMATS[formatName];
  if (!format) throw new CardError(`unknown format ${formatName}`);
  const template = card.template ?? "headline";
  const logo = brand.logo && card.logo !== false ? `<img class="logo" src="${dataUrl(brand.logo, root)}" alt="">` : "";
  const kicker = card.kicker ? `<p class="kicker">${escapeHtml(card.kicker)}</p>` : "";
  const headline = `<h1>${highlight(card.headline, card.highlight)}</h1>`;
  const lead = card.lead ? `<p class="lead">${escapeHtml(card.lead)}</p>` : "";
  const image = card.image
    ? `<div class="stage"><img class="shot" src="${dataUrl(card.image, root)}" alt="${escapeHtml(card.alt ?? "")}">${card.image_label ? `<span class="shot-label">${escapeHtml(card.image_label)}</span>` : ""}</div>`
    : "";
  const footerText = card.footer ?? brand.footer;
  const counter = template === "slide" && card.index ? `<span class="counter">${escapeHtml(card.index)}${card.total ? `/${escapeHtml(card.total)}` : ""}</span>` : "";
  const foot = footerText || card.badge || counter ? `<div class="foot"><span>${escapeHtml(footerText ?? "")}</span>${card.badge ? `<span class="badge">${escapeHtml(card.badge)}</span>` : counter}</div>` : "";
  const onPrimary = template === "statement" || card.background === "primary";
  const copy = `${kicker}${headline}${lead}`;
  const body = format.row
    ? `<div class="safe"><div class="col">${logo}${copy}<div class="grow"></div>${foot}</div>${image}</div>`
    : `<div class="safe">${logo}${copy}${image || '<div class="grow"></div>'}${foot}</div>`;
  return `<!doctype html><html lang="${escapeHtml(card.lang ?? "pt-BR")}"><head><meta charset="utf-8"><title>${escapeHtml(card.alt ?? card.headline)}</title><style>${css(brand, format, root)}</style></head><body><main class="canvas ${template}${onPrimary ? " on-primary" : ""}${format.row ? " row" : ""}">${body}</main></body></html>`;
}

/** Runs inside the page: lists text that overflows its box or leaves the safe area. */
export function layoutCheck() {
  const warnings = [];
  const safe = document.querySelector(".safe").getBoundingClientRect();
  for (const el of document.querySelectorAll(".safe h1, .safe .lead, .safe .kicker, .safe .foot, .safe .logo, .safe .shot")) {
    const r = el.getBoundingClientRect();
    if (r.top < safe.top - 1 || r.bottom > safe.bottom + 1 || r.left < safe.left - 1 || r.right > safe.right + 1) warnings.push(`${el.className || el.tagName} leaves the safe area`);
    if (el.scrollWidth > el.clientWidth + 1 && el.tagName !== "IMG") warnings.push(`${el.className || el.tagName} overflows horizontally`);
  }
  const stage = document.querySelector(".stage");
  if (stage && stage.clientHeight < 160) warnings.push(`image area too small (${stage.clientHeight}px): shorten the copy`);
  const family = getComputedStyle(document.body).fontFamily.split(",")[0].replace(/"/g, "").trim();
  if (family !== "system-ui" && ![...document.fonts].some((font) => font.family.replace(/"/g, "") === family && font.status === "loaded")) warnings.push(`font ${family} did not load`);
  return warnings;
}
