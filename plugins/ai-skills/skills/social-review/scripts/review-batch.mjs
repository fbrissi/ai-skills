#!/usr/bin/env node
// Review step of a social content batch: uploads media to Google Drive (<root>/<Platform>/<YYYY-MM-DD>/), renders
// the GitHub review issue body with a hidden machine-readable marker, reads the marker back, lists reviewer
// /adjust requests, and downloads approved media for the publishers.
// Usage:
//   review-batch.mjs upload <manifest.json> [--profile <md>] [--root <name>] [--no-share]
//   review-batch.mjs issue-body <manifest.json> [--profile <md>]
//   review-batch.mjs revision-comment <manifest.json> --changed <id,id> [--profile <md>]
//   review-batch.mjs bump <manifest.json> --changed <id,id> [--note <text>]
//   review-batch.mjs set-issue <manifest.json> --issue <n> --url <issue URL>
//   review-batch.mjs marker <issue-body.md|-> [--out <manifest.json>]
//   review-batch.mjs adjust-requests --issue <n> [--repo owner/name]
//   review-batch.mjs fetch <manifest.json>
// Env: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN (upload, fetch);
//      GH_TOKEN or GITHUB_TOKEN and GH_REPO or GITHUB_REPOSITORY (adjust-requests).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { Drive, fileUrl, folderUrl, md5 } from "./drive.mjs";
import { composeText, isMain, loadManifest, readProfileConfig, resolveMediaPath, saveManifest } from "./social-manifest.mjs";

export const PLATFORM_NAMES = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube" };
export const MARKER = /<!-- social-content-manifest:v1:([A-Za-z0-9+/=]+) -->/g;
export const MAX_BODY = 65000;

export class ReviewError extends Error {}

const LABELS = {
  pt: { title: (p, d, n) => `${p}: lote de ${d} (${n} ${n === 1 ? "item" : "itens"})`, date: "Data", type: "Tipo", text: "Texto", drive: "Drive", folder: "pasta", how: "Como revisar", howText: (adjust, approve) => `Comente \`${adjust} <id>: <o que mudar>\` (um ou mais itens) para refazer só o que pedir, ou \`${approve}\` para aprovar e publicar o lote. Só comentários de quem tem permissão de escrita contam.`, full: "Textos completos", sources: "Fontes", credits: "Créditos", next: "próxima execução", revision: (n) => `Revisão ${n}`, changed: "Itens refeitos", synthetic: "contém mídia sintética (IA)" },
  en: { title: (p, d, n) => `${p}: batch of ${d} (${n} ${n === 1 ? "item" : "items"})`, date: "Date", type: "Type", text: "Text", drive: "Drive", folder: "folder", how: "How to review", howText: (adjust, approve) => `Comment \`${adjust} <id>: <what to change>\` (one or more items) to redo only what you ask for, or \`${approve}\` to approve and publish the batch. Only comments from people with write access count.`, full: "Full copy", sources: "Sources", credits: "Credits", next: "next run", revision: (n) => `Revision ${n}`, changed: "Items redone", synthetic: "contains synthetic (AI) media" },
};

const labelsFor = (manifest) => (String(manifest.language).toLowerCase().startsWith("pt") ? LABELS.pt : LABELS.en);
const reviewConfig = (profile) => (profile ? readProfileConfig(profile).review ?? {} : {});
const commands = (review) => ({ adjust: review.commands?.adjust ?? "/adjust", approve: review.commands?.approve ?? "/aprove" });

export function encodeMarker(manifest) {
  return `<!-- social-content-manifest:v1:${gzipSync(Buffer.from(JSON.stringify(manifest))).toString("base64")} -->`;
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

export function issueBody(manifest, { review = {} } = {}) {
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
    ...manifest.items.map((item) => `| ${when(item, labels)} | ${item.type}${item.synthetic_media ? " ⚠" : ""} | \`${item.id}\` | ${firstLine(item.title ? `${item.title}: ${composeText(item, manifest.platform)}` : composeText(item, manifest.platform))} | ${driveLinks(item, labels)} |`),
    "",
    `### ${labels.how}`,
    "",
    labels.howText(adjust, approve),
    "",
    `### ${labels.full}`,
  ];
  for (const item of manifest.items) {
    const text = composeText(item, manifest.platform);
    const mark = fence(text);
    lines.push("", `#### \`${item.id}\` (${item.type}, ${when(item, labels)}, ${item.visibility}${item.synthetic_media ? `, ${labels.synthetic}` : ""})`, "");
    if (item.title) lines.push(`**${cell(item.title)}**`, "");
    lines.push(`${mark}text`, text, mark);
    if (item.sources?.length) lines.push("", `${labels.sources}: ${item.sources.map(cell).join("; ")}`);
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
  for (const item of items) lines.push(`- \`${item.id}\` (${item.type}, ${when(item, labels)}): ${firstLine(composeText(item, manifest.platform), 140)} ${driveLinks(item, labels)}`.trimEnd());
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

export async function upload(manifest, { manifestDir, drive, root, share = true }) {
  if (!root) throw new ReviewError("set review.drive_root in the profile or pass --root");
  const platform = PLATFORM_NAMES[manifest.platform];
  const rootFolder = await drive.ensurePath(root);
  manifest.review = { revision: 1, history: [], ...(manifest.review ?? {}), drive_root_id: rootFolder.id };
  const report = [];
  for (const item of manifest.items) {
    const folder = await drive.ensurePath(`${root}/${platform}/${item.date}`);
    if (share) await drive.share(folder.id);
    const files = { ...(item.drive?.files ?? {}) };
    const paths = [...item.media.map((media) => media.path), item.thumbnail, item.options?.captions, item.spec].filter(Boolean);
    for (const path of paths) {
      const full = resolveMediaPath(manifestDir, path);
      if (!full || !existsSync(full)) throw new ReviewError(`${item.id}: file not found: ${path}`);
      const name = `${item.id}--${path.split("/").at(-1)}`;
      const file = await drive.upload(full, folder.id, { name });
      files[path] = { id: file.id, url: fileUrl(file.id), md5: file.md5Checksum ?? md5(full) };
      report.push(`${file.unchanged ? "unchanged" : "uploaded"}: ${item.id} ${path}`);
    }
    for (const path of Object.keys(files)) if (!paths.includes(path)) delete files[path];
    item.drive = { folder_id: folder.id, folder_url: folderUrl(folder.id), files };
  }
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

/** /adjust comments after the latest revision comment, from users with write, maintain or admin access. */
export async function adjustRequests({ repo, issue, token, fetchImpl = fetch, command = "/adjust", api = "https://api.github.com" }) {
  const comments = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(fetchImpl, token, `${api}/repos/${repo}/issues/${issue}/comments?per_page=100&page=${page}`);
    comments.push(...batch);
    if (batch.length < 100) break;
  }
  const lastRevision = comments.reduce((index, comment, position) => (/<!-- social-content:revision \d+ -->/.test(comment.body ?? "") ? position : index), -1);
  const matches = (body) => {
    const text = (body ?? "").trim().toLowerCase();
    return text.startsWith(command.toLowerCase()) && (text.length === command.length || /\s/.test(text[command.length]));
  };
  const candidates = comments.slice(lastRevision + 1).filter((comment) => matches(comment.body));
  const allowed = new Map();
  const requests = [];
  for (const comment of candidates) {
    const login = comment.user?.login;
    if (!login || comment.user?.type === "Bot") continue;
    if (!allowed.has(login)) {
      const permission = await github(fetchImpl, token, `${api}/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`).catch(() => ({}));
      allowed.set(login, ["admin", "maintain", "write"].includes(permission.role_name ?? permission.permission));
    }
    if (allowed.get(login)) requests.push({ id: comment.id, login, created_at: comment.created_at, url: comment.html_url, body: comment.body.trim().slice(command.length).trim() });
  }
  return requests;
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

export async function main(argv, { env = process.env, fetchImpl = fetch, out = process.stdout, readStdin = () => readFileSync(0, "utf8"), driveFactory = () => Drive.fromEnv(env, fetchImpl) } = {}) {
  const { positional, flags } = args(argv);
  const [command, target] = positional;
  const review = reviewConfig(flags.profile);
  if (command === "marker") {
    const manifest = decodeMarker(target === "-" || !target ? readStdin() : readFileSync(target, "utf8"));
    if (!manifest) throw new ReviewError("no social-content-manifest marker found");
    const json = `${JSON.stringify(manifest, null, 2)}\n`;
    if (flags.out) writeFileSync(flags.out, json);
    else out.write(json);
    return;
  }
  if (command === "adjust-requests") {
    const token = env.GH_TOKEN || env.GITHUB_TOKEN;
    const repo = flags.repo || env.GH_REPO || env.GITHUB_REPOSITORY;
    if (!token || !repo || !flags.issue) throw new ReviewError("adjust-requests needs --issue, GH_TOKEN (or GITHUB_TOKEN) and GH_REPO (or GITHUB_REPOSITORY or --repo)");
    out.write(`${JSON.stringify(await adjustRequests({ repo, issue: flags.issue, token, fetchImpl, command: commands(review).adjust }), null, 2)}\n`);
    return;
  }
  if (!target) throw new ReviewError("usage: review-batch.mjs <upload|issue-body|revision-comment|bump|marker|adjust-requests|fetch> ...");
  const manifest = loadManifest(target);
  const manifestDir = dirname(resolve(target));
  const changed = String(flags.changed ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (command === "issue-body") return void out.write(issueBody(manifest, { review }));
  if (command === "revision-comment") return void out.write(revisionComment(manifest, changed, { review, note: flags.note ?? null }));
  if (command === "set-issue") {
    if (!/^\d+$/.test(String(flags.issue ?? ""))) throw new ReviewError("set-issue needs --issue <number>");
    manifest.review = { revision: 1, history: [], ...(manifest.review ?? {}), issue_number: Number(flags.issue), issue_url: flags.url ?? null };
    saveManifest(target, manifest);
    return void out.write(`issue ${flags.issue} recorded\n`);
  }
  if (command === "bump") {
    if (!changed.length) throw new ReviewError("bump needs --changed <id,id>");
    saveManifest(target, bump(manifest, changed, { note: flags.note ?? null }));
    return void out.write(`revision ${manifest.review.revision}: ${changed.join(", ")}\n`);
  }
  const drive = await driveFactory();
  if (command === "upload") {
    const report = await upload(manifest, { manifestDir, drive, root: flags.root ?? review.drive_root, share: !flags["no-share"] && review.drive_share !== false });
    saveManifest(target, manifest);
    return void out.write(`${report.join("\n")}\n`);
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
