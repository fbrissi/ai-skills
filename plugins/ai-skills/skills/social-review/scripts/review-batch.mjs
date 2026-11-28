#!/usr/bin/env node
// Review step of a social content batch: uploads media to Google Drive (<root>/<Platform>/<YYYY-MM-DD HH-mm>/<item
// date>/, one folder per generate run, with a README.md for people), renders the GitHub review issue body with a
// hidden machine-readable marker, reads the marker back, lists reviewer /adjust requests, and downloads approved
// media for the publishers.
// Usage:
//   review-batch.mjs upload <manifest.json> [--profile <md>] [--root <name>] [--no-share]
//   review-batch.mjs issue-body <manifest.json> [--profile <md>]
//   review-batch.mjs revision-comment <manifest.json> --changed <id,id> [--profile <md>]
//   review-batch.mjs bump <manifest.json> --changed <id,id> [--note <text>]
//   review-batch.mjs set-issue <manifest.json> --issue <n> --url <issue URL> [--profile <md>]
//   review-batch.mjs readme <manifest.json> [--profile <md>]
//   review-batch.mjs costs <manifest.json> [--profile <md>] [--usage <usage.jsonl>] [--revision <n>]
//   review-batch.mjs marker <issue-body.md|-> [--out <manifest.json>]
//   review-batch.mjs adjust-requests --issue <n> [--repo owner/name]
//   review-batch.mjs approve --issue <n> --comment-id <id> --out <manifest.json> [--repo owner/name] [--profile <md>]
//   review-batch.mjs fetch <manifest.json>
// Env: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN (upload, fetch);
//      GH_TOKEN or GITHUB_TOKEN and GH_REPO or GITHUB_REPOSITORY (adjust-requests).
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { Drive, fileUrl, folderUrl, md5 } from "./drive.mjs";
import { approveManifest, composeText, costSummary, isMain, loadManifest, priceErrors, readProfileConfig, readUsage, resolveMediaPath, saveManifest } from "./social-manifest.mjs";

export const PLATFORM_NAMES = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", linkedin: "LinkedIn" };
export const MARKER = /<!-- social-content-manifest:v1:([A-Za-z0-9+/=]+) -->/g;
export const MAX_BODY = 65000;

export class ReviewError extends Error {}

const LABELS = {
  pt: { music: "Música", license: "licença", evidence: "evidência", ai: (item) => `IA: ${[item.ai_audio ? "narração sintética" : null, item.synthetic_media ? "imagens geradas por IA" : null].filter(Boolean).join(" e ")} (rótulo de IA na Meta${item.synthetic_media ? ", containsSyntheticMedia no YouTube" : ""}, aviso no texto do LinkedIn)`, title: (p, d, n) => `${p}: lote de ${d} (${n} ${n === 1 ? "item" : "itens"})`, date: "Data", type: "Tipo", text: "Texto", drive: "Drive", folder: "pasta", how: "Como revisar", howText: (adjust, approve) => `Comente \`${adjust} <id>: <o que mudar>\` (um ou mais itens) para refazer só o que pedir, ou \`${approve}\` para aprovar e publicar o lote. Só comentários de quem tem permissão de escrita contam.`, full: "Textos completos", sources: "Fontes", credits: "Créditos", next: "próxima execução", revision: (n) => `Revisão ${n}`, changed: "Itens refeitos", synthetic: "contém mídia sintética (IA)", link: "Link", sent: { preview: "prévia do link", text: "no fim do texto", inText: "no texto", none: "não enviado: o Instagram não tem link clicável; use o link na bio" }, noUtm: "nenhuma", inMedia: "Texto na mídia (do spec; revise como a legenda)", fields: { kicker: "Chamada", headline: "Título", title: "Título", lead: "Texto", body: "Texto", badge: "Selo", voice: "Narração" }, readme: { batch: "Lote", platform: "Plataforma", created: "Criado em", issue: "Issue de revisão", noIssue: "ainda não aberta", revision: "Revisão", approval: "Aprovação", schedule: "Agenda", time: "Horário", files: "Arquivos", status: "Situação", notes: "Créditos e avisos de IA", none: "Nenhum item com créditos, música ou IA.", generated: "Gerado a partir do manifest.json do lote a cada envio ou revisão. Não edite: a próxima atualização substitui este arquivo.", cost: "Custo de geração (campanha)", approvalStatus: { pending: "pendente", approved: "aprovado", rejected: "rejeitado" }, itemStatus: { review: "em revisão", approved: "aprovado", scheduled: "agendado", published: "publicado", failed: "falhou", unknown: "a verificar", skipped: "ignorado" } }, costs: { heading: "Custos de geração", thisRun: (n) => `Revisão ${n} (esta execução)`, tool: "Ferramenta", detail: "Detalhe", quantity: "Quantidade", cost: "Custo estimado (USD)", total: "Total", noPrice: "preço não configurado", unpriced: "sem os itens sem preço", none: "Nenhuma ferramenta paga usada nesta execução.", campaign: (n) => `Campanha até agora (revisões 1 a ${n})`, campaignNone: "nenhuma ferramenta paga", note: "Estimativas com os preços do perfil (`costs.prices`). Só ferramentas pagas usadas para gerar o conteúdo; sem tokens de IA, assinaturas ou infraestrutura.", units: { characters: "caracteres" } } },
  en: { music: "Music", license: "license", evidence: "evidence", ai: (item) => `AI: ${[item.ai_audio ? "synthetic narration" : null, item.synthetic_media ? "AI-generated footage" : null].filter(Boolean).join(" and ")} (Meta AI label${item.synthetic_media ? ", YouTube containsSyntheticMedia" : ""}, LinkedIn text disclosure)`, title: (p, d, n) => `${p}: batch of ${d} (${n} ${n === 1 ? "item" : "items"})`, date: "Date", type: "Type", text: "Text", drive: "Drive", folder: "folder", how: "How to review", howText: (adjust, approve) => `Comment \`${adjust} <id>: <what to change>\` (one or more items) to redo only what you ask for, or \`${approve}\` to approve and publish the batch. Only comments from people with write access count.`, full: "Full copy", sources: "Sources", credits: "Credits", next: "next run", revision: (n) => `Revision ${n}`, changed: "Items redone", synthetic: "contains synthetic (AI) media", link: "Link", sent: { preview: "link preview", text: "at the end of the text", inText: "in the text", none: "not sent: Instagram links are not clickable; use the link in bio" }, noUtm: "none", inMedia: "Text in the media (from the spec; review it like the caption)", fields: { kicker: "Kicker", headline: "Headline", title: "Title", lead: "Lead", body: "Body", badge: "Badge", voice: "Narration" }, readme: { batch: "Batch", platform: "Platform", created: "Created at", issue: "Review issue", noIssue: "not open yet", revision: "Revision", approval: "Approval", schedule: "Schedule", time: "Time", files: "Files", status: "Status", notes: "Credits and AI notices", none: "No item has credits, music, or AI.", generated: "Generated from the batch's manifest.json on every upload or revision. Do not edit: the next update replaces this file.", cost: "Generation cost (campaign)", approvalStatus: { pending: "pending", approved: "approved", rejected: "rejected" }, itemStatus: { review: "in review", approved: "approved", scheduled: "scheduled", published: "published", failed: "failed", unknown: "to check", skipped: "skipped" } }, costs: { heading: "Generation costs", thisRun: (n) => `Revision ${n} (this run)`, tool: "Tool", detail: "Detail", quantity: "Quantity", cost: "Estimated cost (USD)", total: "Total", noPrice: "price not configured", unpriced: "excluding unpriced rows", none: "No paid tool used in this run.", campaign: (n) => `Campaign so far (revisions 1 to ${n})`, campaignNone: "no paid tool", note: "Estimates from the profile prices (`costs.prices`). Only paid tools used to generate the content; no AI tokens, subscriptions, or infrastructure.", units: { characters: "characters" } } },
};

const labelsFor = (manifest) => (String(manifest.language).toLowerCase().startsWith("pt") ? LABELS.pt : LABELS.en);
const commands = (review) => ({ adjust: review.commands?.adjust ?? "/adjust", approve: review.commands?.approve ?? "/aprove" });

/**
 * Usage with the entries of revisions before `revision` folded into one aggregate per revision, service, voice,
 * detail, and unit (same quantities, so totals and costs stay identical); the current revision stays detailed.
 * Aggregates have deterministic ids and list the ledger ids they replace in `sources`, so folding again changes
 * nothing and mergeUsage never adds a folded entry twice.
 */
export function compactUsage(usage, revision) {
  const kept = [];
  const folded = new Map();
  for (const entry of usage ?? []) {
    const entryRevision = entry.revision ?? 1;
    if (entryRevision >= revision) { kept.push(entry); continue; }
    const key = JSON.stringify([entryRevision, entry.service, entry.voice ?? null, entry.detail ?? null, entry.unit]);
    const aggregate = folded.get(key) ?? { id: `r${entryRevision}:${entry.service}:${entry.voice ?? entry.detail ?? "-"}:${entry.unit}`, service: entry.service, unit: entry.unit, quantity: 0, revision: entryRevision, ...(entry.voice ? { voice: entry.voice } : {}), ...(entry.detail ? { detail: entry.detail } : {}), sources: [] };
    aggregate.quantity += entry.quantity;
    aggregate.sources.push(...(entry.sources ?? [entry.id]));
    folded.set(key, aggregate);
  }
  for (const aggregate of folded.values()) aggregate.sources = [...new Set(aggregate.sources)].sort();
  return [...folded.values(), ...kept];
}

/** The marker of a manifest; earlier revisions' usage is folded (compactUsage) so the marker does not grow per call. */
export function encodeMarker(manifest) {
  const compact = manifest.usage ? { ...manifest, usage: compactUsage(manifest.usage, manifest.review?.revision ?? 1) } : manifest;
  return `<!-- social-content-manifest:v1:${gzipSync(Buffer.from(JSON.stringify(compact))).toString("base64")} -->`;
}

/** The manifest in the last marker of a text, or null. */
export function decodeMarker(text) {
  const matches = [...String(text).matchAll(MARKER)];
  if (!matches.length) return null;
  return JSON.parse(gunzipSync(Buffer.from(matches.at(-1)[1], "base64")).toString("utf8"));
}

const cell = (text) => String(text ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
const firstLine = (text, max = 90) => {
  const line = cell(text);
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
const when = (item, labels) => (item.publish_at ? item.publish_at.slice(0, 16).replace("T", " ") : `${item.date} (${labels.next})`);
const fence = (text) => {
  const longest = Math.max(2, ...[...String(text).matchAll(/`+/g)].map((match) => match[0].length));
  return "`".repeat(longest + 1);
};

function driveLinks(item, labels) {
  if (!item.drive?.folder_id) return "";
  const files = Object.entries(item.drive.files ?? {}).map(([path, file]) => `[${path.split("/").at(-1)}](${file.url ?? fileUrl(file.id)})`);
  return [`[${labels.folder}](${item.drive.folder_url ?? folderUrl(item.drive.folder_id)})`, ...files].join(" · ");
}

/** Music line with its license and the Drive evidence, so the reviewer can check the license before approving. */
export function musicLine(music, labels) {
  const who = [music.author, music.source].filter(Boolean).join(", ");
  return `${labels.music}: "${cell(music.title)}"${who ? `, ${cell(who)}` : ""} (${cell(music.license)}; [${labels.license}](${music.license_url}); [${labels.evidence}](${fileUrl(music.evidence)}); sha256 \`${music.sha256.slice(0, 12)}…\`)`;
}

/**
 * The item's link, how the publisher sends it (same rules as composeText), and its UTM parameters, so the reviewer
 * sees a link that does not appear in the text (a Facebook or LinkedIn post sends it as the link preview).
 */
export function linkLines(item, platform, labels) {
  if (!item.link) return [];
  const body = (platform === "youtube" ? item.description : item.caption) ?? "";
  const sent = platform === "instagram" ? "none" : body.includes(item.link) ? "inText" : (platform === "facebook" || platform === "linkedin") && item.type === "post" ? "preview" : "text";
  let utm = [];
  try {
    utm = [...new URL(item.link).searchParams].filter(([key]) => key.startsWith("utm_")).map(([key, value]) => `${key}=${value}`);
  } catch {
    utm = [];
  }
  return [`${labels.link} (${labels.sent[sent]}): ${item.link}`, "", `UTM: ${utm.length ? utm.join(" · ") : labels.noUtm}`];
}

const CARD_FIELDS = ["kicker", "headline", "lead", "badge"];
const SCENE_FIELDS = ["title", "headline", "body", "voice"];

/**
 * Text drawn in an item's media, from its generation spec: the kicker, headline, lead, and badge of every card
 * (stories, carousel slides, feed images) and the on-screen text and narration of every video scene. Stories and
 * slides carry their copy only in the image, so the reviewer reads it here. Returns [{id, lines: [[field, text]]}].
 */
export function mediaTexts(spec) {
  const pick = (entry, fields) => fields.filter((field) => typeof entry[field] === "string" && entry[field].trim()).map((field) => [field, entry[field].replace(/\s+/g, " ").trim()]);
  const entries = Array.isArray(spec?.cards)
    ? spec.cards.map((card) => ({ id: `${card.id}${card.index ? ` (${card.index}${card.total ? `/${card.total}` : ""})` : ""}`, lines: pick(card, CARD_FIELDS) }))
    : Array.isArray(spec?.scenes)
      ? spec.scenes.map((scene) => ({ id: `${scene.id} (${scene.kind})`, lines: pick(scene, SCENE_FIELDS) }))
      : [];
  return entries.filter((entry) => entry.lines.length);
}

function mediaTextBlock(entries, labels) {
  const text = entries.map((entry) => [entry.id, ...entry.lines.map(([field, value]) => `${labels.fields[field]}: ${value}`)].join("\n")).join("\n\n");
  const mark = fence(text);
  return [`${labels.inMedia}:`, "", `${mark}text`, text, mark];
}

export function issueBody(manifest, { review = {}, readSpec = () => null } = {}) {
  const labels = labelsFor(manifest);
  const platform = PLATFORM_NAMES[manifest.platform];
  const { adjust, approve } = commands(review);
  const revision = manifest.review?.revision ?? 1;
  const lines = [
    `<!-- social-content:batch platform=${manifest.platform} batch=${manifest.batch_id} revision=${revision} -->`,
    `## ${labels.title(platform, manifest.publication_date, manifest.items.length)}`,
    "",
    `| ${labels.date} | ${labels.type} | id | ${labels.text} | ${labels.drive} |`,
    "|---|---|---|---|---|",
    ...manifest.items.map((item) => `| ${when(item, labels)} | ${item.type}${item.synthetic_media ? " ⚠" : ""} | \`${item.id}\` | ${firstLine(item.title ? `${item.title}: ${composeText(item, manifest.platform, manifest.language)}` : composeText(item, manifest.platform, manifest.language))} | ${driveLinks(item, labels)} |`),
    "",
    `### ${labels.how}`,
    "",
    labels.howText(adjust, approve),
    "",
    `### ${labels.full}`,
  ];
  for (const item of manifest.items) {
    const text = composeText(item, manifest.platform, manifest.language);
    const mark = fence(text);
    lines.push("", `#### \`${item.id}\` (${item.type}, ${when(item, labels)}, ${item.visibility}${item.synthetic_media ? `, ${labels.synthetic}` : ""})`, "");
    if (item.title) lines.push(`**${cell(item.title)}**`, "");
    const inMedia = item.spec ? mediaTexts(readSpec(item.spec)) : [];
    if (text.trim() || !inMedia.length) lines.push(`${mark}text`, text, mark, ...(inMedia.length ? [""] : []));
    if (inMedia.length) lines.push(...mediaTextBlock(inMedia, labels));
    if (item.link) lines.push("", ...linkLines(item, manifest.platform, labels));
    if (item.sources?.length) lines.push("", `${labels.sources}: ${item.sources.map(cell).join("; ")}`);
    if (item.music) lines.push("", musicLine(item.music, labels));
    if (item.ai_audio || item.synthetic_media) lines.push("", labels.ai(item));
  }
  lines.push("", encodeMarker(manifest), "");
  const body = lines.join("\n");
  if (body.length > MAX_BODY) throw new ReviewError(`issue body has ${body.length} characters (GitHub allows 65536); split the batch`);
  return body;
}

export function revisionComment(manifest, changed, { review = {}, note = null } = {}) {
  const labels = labelsFor(manifest);
  const { approve } = commands(review);
  const items = manifest.items.filter((item) => changed.includes(item.id));
  const lines = [`<!-- social-content:revision ${manifest.review?.revision ?? 1} -->`, `### ${labels.revision(manifest.review?.revision ?? 1)}`, ""];
  if (note) lines.push(note, "");
  lines.push(`${labels.changed}:`, "");
  for (const item of items) lines.push(`- \`${item.id}\` (${item.type}, ${when(item, labels)}): ${firstLine(composeText(item, manifest.platform, manifest.language), 140)} ${driveLinks(item, labels)}`.trimEnd());
  lines.push("", labels === LABELS.pt ? `O corpo da issue tem o lote atualizado. \`${approve}\` aprova esta revisão.` : `The issue body has the updated batch. \`${approve}\` approves this revision.`, "");
  return lines.join("\n");
}

export function bump(manifest, changed, { note = null, now = new Date() } = {}) {
  const review = manifest.review ?? { revision: 1, history: [] };
  review.history = [...(review.history ?? []), { revision: review.revision ?? 1, at: now.toISOString(), changed, note }];
  review.revision = (review.revision ?? 1) + 1;
  manifest.review = review;
  manifest.approval = { status: "pending", by: null, at: null, revision: null };
  return manifest;
}

/**
 * Adds ledger entries not yet in manifest.usage, tagging untagged ones with the current revision. An entry already
 * merged, directly (its id) or folded into an aggregate of the marker (its sources), is never added or tagged again.
 */
export function mergeUsage(manifest, entries) {
  const known = new Set((manifest.usage ?? []).flatMap((entry) => [entry.id, ...(entry.sources ?? [])]));
  const revision = manifest.review?.revision ?? 1;
  const added = entries.filter((entry) => !known.has(entry.id)).map((entry) => ({ ...entry, revision: entry.revision ?? revision }));
  if (added.length || manifest.usage) manifest.usage = [...(manifest.usage ?? []), ...added];
  return added.length;
}

function checkPrices(config, source = "the profile") {
  const errors = priceErrors(config);
  if (errors.length) throw new ReviewError(`invalid costs in ${source}:\n- ${errors.join("\n- ")}`);
}

/**
 * Records the profile's costs.prices in the manifest (cost_prices), so a later README or costs comment rendered
 * without --profile keeps the same prices. Returns true when the snapshot changed.
 */
export function snapshotPrices(manifest, config) {
  checkPrices(config);
  const prices = config?.costs?.prices;
  if (!prices || JSON.stringify(prices) === JSON.stringify(manifest.cost_prices ?? null)) return false;
  manifest.cost_prices = JSON.parse(JSON.stringify(prices));
  return true;
}

/** The prices to estimate with: the profile's when given, else the manifest's snapshot, else none. */
export function pricingConfig(manifest, config) {
  checkPrices(config);
  if (config?.costs?.prices) return config;
  if (!manifest.cost_prices) return config;
  const snapshot = { costs: { prices: manifest.cost_prices } };
  checkPrices(snapshot, "the manifest's cost_prices");
  return snapshot;
}

const money = (value, language) => new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
const count = (value, language) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);

function costLine(summary, manifest, labels) {
  const c = labels.costs;
  if (!summary.rows.length) return c.campaignNone;
  const parts = summary.rows.map((row) => `${row.service}${row.detail ? ` (${row.detail})` : ""}: ${count(row.quantity, manifest.language)} ${c.units[row.unit] ?? row.unit}, ${row.cost === null ? c.noPrice : `US$ ${money(row.cost, manifest.language)}`}`);
  const priced = summary.rows.some((row) => row.cost !== null);
  return `${priced ? `US$ ${money(summary.total, manifest.language)}${summary.unpriced ? ` (${c.unpriced})` : ""}` : "-"}; ${parts.join("; ")}`;
}

/**
 * The "Generation costs" comment of one run or revision: the paid generation calls tagged with that revision
 * (quantity, unit, estimated USD from the profile's costs.prices, "price not configured" when missing), and the
 * campaign's cumulative total across revisions. Says so when no paid tool was used, so the free path is visible.
 */
export function costsComment(manifest, profileConfig, { revision = manifest.review?.revision ?? 1 } = {}) {
  const config = pricingConfig(manifest, profileConfig);
  const labels = labelsFor(manifest);
  const c = labels.costs;
  const usage = manifest.usage ?? [];
  const run = costSummary(usage.filter((entry) => (entry.revision ?? 1) === revision), config);
  const campaign = costSummary(usage.filter((entry) => (entry.revision ?? 1) <= revision), config);
  const lines = [`<!-- social-content:costs revision=${revision} -->`, `### ${c.heading}`, "", `${c.thisRun(revision)}:`, ""];
  if (!run.rows.length) lines.push(c.none);
  else {
    lines.push(`| ${c.tool} | ${c.detail} | ${c.quantity} | ${c.cost} |`, "|---|---|---:|---:|");
    for (const row of run.rows) lines.push(`| ${cell(row.service)} | ${cell(row.detail ?? "-")} | ${count(row.quantity, manifest.language)} ${c.units[row.unit] ?? row.unit} | ${row.cost === null ? c.noPrice : money(row.cost, manifest.language)} |`);
    const total = run.rows.some((row) => row.cost !== null) ? `**${money(run.total, manifest.language)}**${run.unpriced ? ` (${c.unpriced})` : ""}` : "-";
    lines.push(`| **${c.total}** | | | ${total} |`);
  }
  lines.push("", `${c.campaign(revision)}: ${costLine(campaign, manifest, labels)}`, "", `_${c.note}_`, "");
  return lines.join("\n");
}

/** {date: "YYYY-MM-DD", time: "HH:mm"} of an instant in an IANA time zone. */
export function localStamp(instant, timeZone) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new ReviewError(`invalid date: ${instant}`);
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(date).map((part) => [part.type, part.value]));
  } catch {
    throw new ReviewError(`invalid time zone: ${timeZone}`);
  }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Run folder name: the batch's creation date and time in its time zone, "YYYY-MM-DD HH-mm" (sortable, no colon). */
export function runFolderName(createdAt, timeZone) {
  const { date, time } = localStamp(createdAt, timeZone);
  return `${date} ${time.replace(":", "-")}`;
}

export const README_BATCH = /^- (?:Lote|Batch): `([^`]+)`$/m;

/** Batch id in the README of a Drive folder, or null when it has none (an ownership check, not a data source). */
async function folderBatch(drive, folderId) {
  const readme = (await drive.children(folderId)).find((file) => file.name === "README.md");
  if (!readme) return null;
  const dir = mkdtempSync(join(tmpdir(), "social-readme-"));
  try {
    const path = join(dir, "README.md");
    await drive.download(readme.id, path);
    return README_BATCH.exec(readFileSync(path, "utf8"))?.[1] ?? null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The batch's run folder: the one recorded in review.drive_run_folder, or the runFolderName folder. A folder of that
 * name whose README names another batch belongs to it, so the batch gets "<name> (2)", "<name> (3)", and so on.
 */
export async function runFolder(manifest, { drive, root, share = true, now = new Date() }) {
  const recorded = manifest.review?.drive_run_folder;
  if (recorded?.id) return recorded;
  const base = runFolderName(manifest.created_at ?? now, manifest.timezone);
  const parent = await drive.ensurePath(`${root}/${PLATFORM_NAMES[manifest.platform]}`);
  let name;
  let folder;
  for (let n = 1; !folder; n += 1) {
    name = n === 1 ? base : `${base} (${n})`;
    const existing = await drive.findFolder(name, parent.id);
    if (!existing) folder = await drive.createFolder(name, parent.id);
    else {
      const owner = await folderBatch(drive, existing.id);
      if (!owner || owner === manifest.batch_id) folder = existing;
    }
  }
  if (share) await drive.share(folder.id);
  manifest.review = { revision: 1, history: [], ...(manifest.review ?? {}), drive_run_folder: { id: folder.id, name, url: folderUrl(folder.id) } };
  return manifest.review.drive_run_folder;
}

const scheduleKey = (item) => (item.publish_at ? item.publish_at.slice(0, 16) : `${item.date}T99`);
const driveName = (item, path) => `${item.id}--${path.split("/").at(-1)}`;

function itemStatus(manifest, item, labels) {
  const state = manifest.state?.[item.id]?.status;
  if (state) return labels.readme.itemStatus[state] ?? state;
  return manifest.approval?.status === "approved" ? labels.readme.itemStatus.approved : labels.readme.itemStatus.review;
}

/**
 * README.md of the run folder, for people browsing Drive: batch, platform, creation time, review issue, revision,
 * approval, the schedule sorted by publish time, and the credits and AI notices. Generated from the manifest; never
 * parsed back (the manifest stays the automation source).
 */
export function runReadme(manifest, { config: profileConfig = null } = {}) {
  const config = pricingConfig(manifest, profileConfig);
  const labels = labelsFor(manifest);
  const r = labels.readme;
  const platform = PLATFORM_NAMES[manifest.platform];
  const revision = manifest.review?.revision ?? 1;
  const created = manifest.created_at ? localStamp(manifest.created_at, manifest.timezone) : null;
  const issue = manifest.review?.issue_url ?? (manifest.review?.issue_number ? `#${manifest.review.issue_number}` : r.noIssue);
  const approval = r.approvalStatus[manifest.approval?.status ?? "pending"] ?? manifest.approval?.status;
  const items = manifest.items.map((item, index) => ({ item, index })).sort((a, b) => scheduleKey(a.item).localeCompare(scheduleKey(b.item)) || a.index - b.index).map(({ item }) => item);
  const lines = [
    `# ${labels.title(platform, manifest.publication_date, manifest.items.length)}`,
    "",
    `- ${r.batch}: \`${manifest.batch_id}\``,
    `- ${r.platform}: ${platform}`,
    `- ${r.created}: ${created ? `${created.date} ${created.time} (${manifest.timezone})` : "-"}`,
    `- ${r.issue}: ${issue}`,
    `- ${r.revision}: ${revision}`,
    `- ${r.approval}: ${approval}${manifest.approval?.status === "approved" && manifest.approval.revision ? ` (${r.revision.toLowerCase()} ${manifest.approval.revision})` : ""}`,
    `- ${r.cost}: ${costLine(costSummary(manifest.usage ?? [], config), manifest, labels)}`,
    "",
    `## ${r.schedule}`,
    "",
    `| ${labels.date} | ${r.time} | ${labels.type} | id | ${labels.text} | ${r.files} | ${r.status} |`,
    "|---|---|---|---|---|---|---|",
  ];
  for (const item of items) {
    const text = composeText(item, manifest.platform, manifest.language).split("\n").find((line) => line.trim()) ?? "";
    const summary = item.title ? `${item.title}${text ? `: ${text}` : ""}` : text;
    const files = Object.keys(item.drive?.files ?? {}).map((path) => `\`${driveName(item, path)}\``).join(", ");
    const date = item.publish_at ? item.publish_at.slice(0, 10) : item.date;
    const time = item.publish_at ? item.publish_at.slice(11, 16) : labels.next;
    lines.push(`| ${date} | ${time} | ${item.type} | \`${item.id}\` | ${firstLine(summary) || "-"} | ${files || "-"} | ${itemStatus(manifest, item, labels)} |`);
  }
  lines.push("", `## ${r.notes}`, "");
  const notes = items.filter((item) => item.credits || item.music || item.ai_audio || item.synthetic_media);
  if (!notes.length) lines.push(r.none);
  for (const item of notes) {
    lines.push(`- \`${item.id}\``);
    if (item.credits) lines.push(`  - ${cell(item.credits)}`);
    if (item.music) lines.push(`  - ${musicLine(item.music, labels)}`);
    if (item.ai_audio || item.synthetic_media) lines.push(`  - ${labels.ai(item)}`);
  }
  lines.push("", `_${r.generated}_`, "");
  return lines.join("\n");
}

/** Writes runReadme to the run folder as README.md (replaced in place, so its link survives). */
export async function uploadReadme(manifest, { drive, config = null }) {
  pricingConfig(manifest, config);
  const folder = manifest.review?.drive_run_folder;
  if (!folder?.id) throw new ReviewError("the manifest has no review.drive_run_folder; run upload first");
  const dir = mkdtempSync(join(tmpdir(), "social-readme-"));
  try {
    const path = join(dir, "README.md");
    writeFileSync(path, runReadme(manifest, { config }));
    return await drive.upload(path, folder.id, { name: "README.md" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function upload(manifest, { manifestDir, drive, root, share = true, now = new Date(), config = null, usage = [] }) {
  if (!root) throw new ReviewError("set review.drive_root in the profile or pass --root");
  snapshotPrices(manifest, config);
  mergeUsage(manifest, usage);
  const rootFolder = await drive.ensurePath(root);
  manifest.review = { revision: 1, history: [], ...(manifest.review ?? {}), drive_root_id: rootFolder.id };
  const run = await runFolder(manifest, { drive, root, share, now });
  const report = [`run folder: ${run.name}`];
  for (const item of manifest.items) {
    const folder = await drive.ensurePath(item.date, { parentId: run.id });
    if (share) await drive.share(folder.id);
    const files = { ...(item.drive?.files ?? {}) };
    const paths = [...item.media.map((media) => media.path), item.thumbnail, item.options?.captions, item.spec].filter(Boolean);
    for (const path of paths) {
      const full = resolveMediaPath(manifestDir, path);
      if (!full || !existsSync(full)) throw new ReviewError(`${item.id}: file not found: ${path}`);
      const name = driveName(item, path);
      const file = await drive.upload(full, folder.id, { name });
      files[path] = { id: file.id, url: fileUrl(file.id), md5: file.md5Checksum ?? md5(full) };
      report.push(`${file.unchanged ? "unchanged" : "uploaded"}: ${item.id} ${path}`);
    }
    for (const path of Object.keys(files)) if (!paths.includes(path)) delete files[path];
    item.drive = { folder_id: folder.id, folder_url: folderUrl(folder.id), files };
  }
  const readme = await uploadReadme(manifest, { drive, config });
  report.push(`${readme.unchanged ? "unchanged" : "uploaded"}: ${run.name}/README.md`);
  return report;
}

export async function fetchMedia(manifest, { manifestDir, drive }) {
  const report = [];
  for (const item of manifest.items) {
    for (const [path, file] of Object.entries(item.drive?.files ?? {})) {
      const full = resolveMediaPath(manifestDir, path);
      if (!full) throw new ReviewError(`${item.id}: unsafe path ${path}`);
      if (existsSync(full) && file.md5 && md5(full) === file.md5) { report.push(`present: ${path}`); continue; }
      await drive.download(file.id, full);
      if (file.md5 && md5(full) !== file.md5) throw new ReviewError(`${item.id}: checksum mismatch for ${path}`);
      report.push(`downloaded: ${path}`);
    }
  }
  return report;
}

async function github(fetchImpl, token, url) {
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
  if (!response.ok) throw new ReviewError(`GitHub API ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}

export const REVISION_MARK = /<!-- social-content:revision (\d+) -->/;

/** True when a comment body starts with the command followed by whitespace or the end. */
export function isCommand(body, command) {
  const text = (body ?? "").trim().toLowerCase();
  return text.startsWith(command.toLowerCase()) && (text.length === command.length || /\s/.test(text[command.length]));
}

async function listComments(fetchImpl, token, api, repo, issue) {
  const comments = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(fetchImpl, token, `${api}/repos/${repo}/issues/${issue}/comments?per_page=100&page=${page}`);
    comments.push(...batch);
    if (batch.length < 100) break;
  }
  return comments;
}

function permissionChecker(fetchImpl, token, api, repo) {
  const cache = new Map();
  return async (user) => {
    const login = user?.login;
    if (!login) return false;
    if (!cache.has(login)) {
      const permission = await github(fetchImpl, token, `${api}/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`).catch(() => ({}));
      cache.set(login, ["admin", "maintain", "write"].includes(permission.role_name ?? permission.permission));
    }
    return cache.get(login);
  };
}

/** Index and number of the last revision comment posted by a bot (the workflow) or a writer; others cannot fake one. */
async function lastRevision(comments, isWriter) {
  let found = { index: -1, revision: 1 };
  for (const [index, comment] of comments.entries()) {
    const match = REVISION_MARK.exec(comment.body ?? "");
    if (!match) continue;
    if (comment.user?.type === "Bot" || (await isWriter(comment.user))) found = { index, revision: Number(match[1]) };
  }
  return found;
}

/** /adjust comments after the latest revision comment, from users with write, maintain or admin access. */
export async function adjustRequests({ repo, issue, token, fetchImpl = fetch, command = "/adjust", api = "https://api.github.com" }) {
  const comments = await listComments(fetchImpl, token, api, repo, issue);
  const isWriter = permissionChecker(fetchImpl, token, api, repo);
  const { index } = await lastRevision(comments, isWriter);
  const requests = [];
  for (const comment of comments.slice(index + 1)) {
    if (!isCommand(comment.body, command) || comment.user?.type === "Bot") continue;
    if (await isWriter(comment.user)) requests.push({ id: comment.id, login: comment.user.login, created_at: comment.created_at, url: comment.html_url, body: comment.body.trim().slice(command.length).trim() });
  }
  return requests;
}

/**
 * Checks an approval comment and returns the approved manifest. The comment must be on this open issue, start with
 * the approve command, come from a writer (not a bot), and be newer than the last revision comment; the issue body's
 * header and marker must be at that same revision, so the approval covers exactly what the reviewer saw.
 */
export async function approveFromComment({ repo, issue, commentId, token, fetchImpl = fetch, command = "/aprove", api = "https://api.github.com" }) {
  const data = await github(fetchImpl, token, `${api}/repos/${repo}/issues/${issue}`);
  if (data.state !== "open") throw new ReviewError(`issue ${issue} is ${data.state}`);
  const header = /<!-- social-content:batch platform=(\S+) batch=(\S+) revision=(\d+) -->/.exec(data.body ?? "");
  if (!header) throw new ReviewError(`issue ${issue} is not a social content review issue`);
  const manifest = decodeMarker(data.body);
  if (!manifest) throw new ReviewError(`issue ${issue} has no manifest marker`);
  const revision = Number(header[3]);
  if (manifest.platform !== header[1] || manifest.batch_id !== header[2] || (manifest.review?.revision ?? 1) !== revision) throw new ReviewError("the issue header and the manifest marker disagree; wait for the running adjust to finish");
  const comments = await listComments(fetchImpl, token, api, repo, issue);
  const position = comments.findIndex((comment) => String(comment.id) === String(commentId));
  if (position < 0) throw new ReviewError(`comment ${commentId} is not on issue ${issue}`);
  const comment = comments[position];
  if (!isCommand(comment.body, command)) throw new ReviewError(`comment ${commentId} is not ${command}`);
  if (comment.user?.type === "Bot") throw new ReviewError("bots cannot approve");
  const isWriter = permissionChecker(fetchImpl, token, api, repo);
  if (!(await isWriter(comment.user))) throw new ReviewError(`${comment.user?.login} has no write access`);
  const last = await lastRevision(comments, isWriter);
  if (position < last.index) throw new ReviewError(`comment ${commentId} predates revision ${last.revision}; approve the current revision`);
  if (last.index >= 0 && last.revision !== revision) throw new ReviewError(`the last revision comment is ${last.revision} but the issue body is at ${revision}`);
  return approveManifest(manifest, { by: comment.user.login, at: new Date(comment.created_at) });
}

function args(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) positional.push(argv[i]);
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
    else flags[argv[i].slice(2)] = true;
  }
  return { positional, flags };
}

export async function main(argv, { env = process.env, fetchImpl = fetch, out = process.stdout, err = process.stderr, readStdin = () => readFileSync(0, "utf8"), driveFactory = () => Drive.fromEnv(env, fetchImpl) } = {}) {
  const { positional, flags } = args(argv);
  const [command, target] = positional;
  const config = flags.profile ? readProfileConfig(flags.profile) : null;
  const review = config?.review ?? {};
  if (command === "marker") {
    const manifest = decodeMarker(target === "-" || !target ? readStdin() : readFileSync(target, "utf8"));
    if (!manifest) throw new ReviewError("no social-content-manifest marker found");
    const json = `${JSON.stringify(manifest, null, 2)}\n`;
    if (flags.out) writeFileSync(flags.out, json);
    else out.write(json);
    return;
  }
  if (command === "approve") {
    const token = env.GH_TOKEN || env.GITHUB_TOKEN;
    const repo = flags.repo || env.GH_REPO || env.GITHUB_REPOSITORY;
    if (!token || !repo || !flags.issue || !flags["comment-id"] || !flags.out) throw new ReviewError("approve needs --issue, --comment-id, --out, GH_TOKEN (or GITHUB_TOKEN) and GH_REPO (or GITHUB_REPOSITORY or --repo)");
    const manifest = await approveFromComment({ repo, issue: flags.issue, commentId: flags["comment-id"], token, fetchImpl, command: commands(review).approve });
    saveManifest(flags.out, manifest);
    out.write(`${JSON.stringify({ approved: true, by: manifest.approval.by, revision: manifest.approval.revision, platform: manifest.platform, batch_id: manifest.batch_id })}\n`);
    return;
  }
  if (command === "adjust-requests") {
    const token = env.GH_TOKEN || env.GITHUB_TOKEN;
    const repo = flags.repo || env.GH_REPO || env.GITHUB_REPOSITORY;
    if (!token || !repo || !flags.issue) throw new ReviewError("adjust-requests needs --issue, GH_TOKEN (or GITHUB_TOKEN) and GH_REPO (or GITHUB_REPOSITORY or --repo)");
    out.write(`${JSON.stringify(await adjustRequests({ repo, issue: flags.issue, token, fetchImpl, command: commands(review).adjust }), null, 2)}\n`);
    return;
  }
  if (!target) throw new ReviewError("usage: review-batch.mjs <upload|issue-body|revision-comment|bump|set-issue|readme|costs|marker|adjust-requests|approve|fetch> ...");
  const manifest = loadManifest(target);
  const manifestDir = dirname(resolve(target));
  const changed = String(flags.changed ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const readSpec = (path) => {
    const full = resolveMediaPath(manifestDir, path);
    if (!full || !existsSync(full)) return null;
    try {
      return JSON.parse(readFileSync(full, "utf8"));
    } catch {
      return null;
    }
  };
  if (command === "issue-body") return void out.write(issueBody(manifest, { review, readSpec }));
  if (command === "revision-comment") return void out.write(revisionComment(manifest, changed, { review, note: flags.note ?? null }));
  if (command === "set-issue") {
    if (!/^\d+$/.test(String(flags.issue ?? ""))) throw new ReviewError("set-issue needs --issue <number>");
    manifest.review = { revision: 1, history: [], ...(manifest.review ?? {}), issue_number: Number(flags.issue), issue_url: flags.url ?? null };
    snapshotPrices(manifest, config);
    saveManifest(target, manifest);
    out.write(`issue ${flags.issue} recorded\n`);
    // The README gets the issue link now; the issue is already recorded, so a Drive failure is only a warning.
    if (manifest.review.drive_run_folder?.id) {
      try {
        await uploadReadme(manifest, { drive: await driveFactory(), config });
      } catch (error) {
        err.write(`warning: README.md not updated (${error.message}); run review-batch.mjs readme ${target}\n`);
      }
    }
    return;
  }
  const usagePath = flags.usage ? resolve(flags.usage) : join(manifestDir, "usage.jsonl");
  if (command === "costs") {
    const revision = flags.revision !== undefined ? Number(flags.revision) : undefined;
    if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) throw new ReviewError("--revision must be an integer >= 1");
    const merged = mergeUsage(manifest, readUsage(usagePath));
    if (snapshotPrices(manifest, config) || merged) saveManifest(target, manifest);
    return void out.write(costsComment(manifest, config, { revision }));
  }
  if (command === "bump") {
    if (!changed.length) throw new ReviewError("bump needs --changed <id,id>");
    saveManifest(target, bump(manifest, changed, { note: flags.note ?? null }));
    return void out.write(`revision ${manifest.review.revision}: ${changed.join(", ")}\n`);
  }
  const drive = await driveFactory();
  if (command === "upload") {
    const report = await upload(manifest, { manifestDir, drive, root: flags.root ?? review.drive_root, share: !flags["no-share"] && review.drive_share !== false, config, usage: readUsage(usagePath) });
    saveManifest(target, manifest);
    return void out.write(`${report.join("\n")}\n`);
  }
  if (command === "readme") {
    if (snapshotPrices(manifest, config)) saveManifest(target, manifest);
    const file = await uploadReadme(manifest, { drive, config });
    return void out.write(`${file.unchanged ? "unchanged" : "uploaded"}: ${manifest.review.drive_run_folder.name}/README.md\n`);
  }
  if (command === "fetch") return void out.write(`${(await fetchMedia(manifest, { manifestDir, drive })).join("\n")}\n`);
  throw new ReviewError(`unknown command ${command}`);
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
