#!/usr/bin/env node
// Renders a cards spec to PNG/JPEG with Chromium (playwright-core). Run it through render.sh (Docker, --network none).
// Usage: render-cards.mjs --spec <cards.json> --out <dir> [--profile <profile.md>] [--root <dir>] [--only <id>]
//        [--type png|jpeg] [--quality 92] [--html <dir>] [--allow-warnings]
// Writes <out>/<card-id>-<format>.<ext> and prints a JSON report ({cards: [{id, format, path, width, height, warnings}]}).
import { globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { brandFrom, buildPage, FORMATS, layoutCheck, MAX_EMPTY_SHARE, MIN_SHOT_SCALE, validateCard } from "./cards.mjs";
import { isMain, readProfileConfig } from "./social-manifest.mjs";

async function loadChromium() {
  const base = process.env.PLAYWRIGHT_CORE_PATH;
  const module = base ? await import(pathToFileURL(join(base, "index.mjs")).href) : await import("playwright-core");
  return module.chromium ?? module.default.chromium;
}

export function jobsFor(spec, { only = null } = {}) {
  const errors = spec.cards.flatMap(validateCard);
  if (errors.length) throw new Error(`invalid cards spec:\n- ${errors.join("\n- ")}`);
  return spec.cards.filter((card) => !only || card.id === only).flatMap((card) => card.formats.map((format) => ({ card, format })));
}

export async function main(argv) {
  const value = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (!value("spec") || !value("out")) throw new Error("usage: render-cards.mjs --spec <cards.json> --out <dir> [--profile <md>] [--root <dir>]");
  const root = resolve(value("root") ?? process.cwd());
  const spec = JSON.parse(readFileSync(resolve(root, value("spec")), "utf8"));
  const brand = brandFrom(value("profile") ? readProfileConfig(resolve(root, value("profile"))) : spec);
  const outDir = resolve(root, value("out"));
  const htmlDir = value("html") ? resolve(root, value("html")) : null;
  mkdirSync(outDir, { recursive: true });
  if (htmlDir) mkdirSync(htmlDir, { recursive: true });
  const chromium = await loadChromium();
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM ?? globSync("/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell")[0];
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const report = [];
  try {
    for (const { card, format } of jobsFor(spec, { only: value("only") ?? null })) {
      const size = FORMATS[format];
      const type = value("type") ?? card.type ?? size.type;
      const path = join(outDir, `${card.id}-${format}.${type === "jpeg" ? "jpg" : "png"}`);
      const html = buildPage(card, format, brand, root);
      if (htmlDir) writeFileSync(join(htmlDir, `${card.id}-${format}.html`), html);
      const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
      await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const warnings = await page.evaluate(layoutCheck, { maxEmptyShare: MAX_EMPTY_SHARE, minShotScale: MIN_SHOT_SCALE });
      await page.locator(".canvas").screenshot({ path, type, ...(type === "jpeg" ? { quality: Number(value("quality") ?? 92) } : {}) });
      await page.close();
      report.push({ id: card.id, format, path: relative(root, path), width: size.w, height: size.h, warnings });
      process.stderr.write(`${warnings.length ? "WARN" : "ok  "} ${card.id}-${format}${warnings.length ? `: ${warnings.join("; ")}` : ""}\n`);
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(`${JSON.stringify({ cards: report }, null, 2)}\n`);
  return report.some((entry) => entry.warnings.length) && !argv.includes("--allow-warnings") ? 1 : 0;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
