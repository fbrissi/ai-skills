import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Drive } from "../../.rulesync/skills/social-review/scripts/drive.mjs";
import { adjustRequests, bump, decodeMarker, encodeMarker, fetchMedia, issueBody, revisionComment, upload } from "../../.rulesync/skills/social-review/scripts/review-batch.mjs";
import { fakeFetch, item, json, manifest, png, tempDir, writeManifest } from "./helpers.mjs";

const pending = (items) => manifest("facebook", items, { approval: { status: "pending", by: null, at: null, revision: null } });

test("the marker round-trips the manifest and the last marker wins", () => {
  const data = pending([item()]);
  assert.deepEqual(decodeMarker(`x ${encodeMarker({ old: true })} y ${encodeMarker(data)}`), data);
  assert.equal(decodeMarker("no marker"), null);
});

test("issue body has the table, how to review, the full copy and the marker", () => {
  const data = pending([item({ caption: "Texto com ``` crases" }), item({ id: "b", date: "2026-12-01", publish_at: "2026-12-01T12:30:00-03:00", drive: { folder_id: "F", folder_url: "https://drive/F", files: { "media/card.png": { id: "X", url: "https://drive/X" } } } })]);
  const body = issueBody(data, { review: { commands: { approve: "/aprove" } } });
  assert.match(body, /^<!-- social-content:batch platform=facebook batch=2026-11-30-facebook revision=1 -->/);
  assert.match(body, /\| 2026-11-30 12:30 \| photo \| `2026-11-30-facebook-1` \|/);
  assert.match(body, /\[pasta\]\(https:\/\/drive\/F\) · \[card.png\]\(https:\/\/drive\/X\)/);
  assert.match(body, /`\/adjust <id>: <o que mudar>`/);
  assert.match(body, /`\/aprove`/);
  assert.match(body, /````text\nTexto com ``` crases/);
  assert.deepEqual(decodeMarker(body), data);
});

test("English batches get English labels; huge batches are refused", () => {
  const data = pending([item()]);
  data.language = "en";
  assert.match(issueBody(data), /How to review/);
  const huge = pending(Array.from({ length: 60 }, (_, i) => item({ id: `i${i}`, caption: "x".repeat(2000) + Math.random() })));
  assert.throws(() => issueBody(huge), /split the batch/);
});

test("bump starts a new revision, resets approval, and the comment lists the items", () => {
  const data = bump(manifest("facebook", [item(), item({ id: "b" })]), ["b"], { note: "Trocado o gancho", now: new Date("2026-11-28T10:00:00Z") });
  assert.equal(data.review.revision, 2);
  assert.equal(data.approval.status, "pending");
  assert.deepEqual(data.review.history.at(-1), { revision: 1, at: "2026-11-28T10:00:00.000Z", changed: ["b"], note: "Trocado o gancho" });
  const comment = revisionComment(data, ["b"], { note: "Trocado o gancho" });
  assert.match(comment, /^<!-- social-content:revision 2 -->/);
  assert.match(comment, /- `b` \(photo/);
  assert.ok(!comment.includes("`2026-11-30-facebook-1`"));
});

test("adjust requests come only after the last revision, from writers, never bots", async () => {
  const comments = [
    { id: 1, body: "/adjust a: antigo", user: { login: "ana", type: "User" } },
    { id: 2, body: "<!-- social-content:revision 2 -->\n### Revisão 2", user: { login: "bot", type: "Bot" } },
    { id: 3, body: "/adjust b: troque a imagem", user: { login: "ana", type: "User" }, created_at: "t", html_url: "u" },
    { id: 4, body: "/adjust c: x", user: { login: "eve", type: "User" } },
    { id: 5, body: "/adjust d: y", user: { login: "helper[bot]", type: "Bot" } },
    { id: 6, body: "Looks good", user: { login: "ana", type: "User" } },
    { id: 7, body: "/adjusted the plan myself", user: { login: "ana", type: "User" } },
  ];
  const fetchImpl = fakeFetch([
    [(url) => url.includes("/issues/9/comments"), () => comments],
    [(url) => url.endsWith("/collaborators/ana/permission"), () => ({ permission: "write", role_name: "write" })],
    [(url) => url.endsWith("/collaborators/eve/permission"), () => ({ permission: "read", role_name: "read" })],
  ]);
  const requests = await adjustRequests({ repo: "o/r", issue: 9, token: "t", fetchImpl });
  assert.deepEqual(requests, [{ id: 3, login: "ana", created_at: "t", url: "u", body: "b: troque a imagem" }]);
});

test("upload creates <root>/<Platform>/<date>/, shares it, and records file ids", async () => {
  const dir = tempDir({ "media/card.png": png(10, 10) });
  const data = pending([item()]);
  const folders = new Map();
  let ids = 0;
  const fetchImpl = fakeFetch([
    [(url, call) => url.includes("/drive/v3/files?") && call.method === "GET", (url) => {
      const q = new URL(url).searchParams.get("q");
      const name = q.match(/name = '([^']+)'/)?.[1];
      const parent = q.match(/'([^']+)' in parents/)?.[1];
      const id = folders.get(`${parent}/${name}`);
      return { files: id ? [{ id, name }] : [] };
    }],
    [(url, call) => url.includes("/drive/v3/files?fields") && call.method === "POST", (_, call) => {
      const body = JSON.parse(call.body);
      const id = `fold${++ids}`;
      folders.set(`${body.parents[0]}/${body.name}`, id);
      return { id, name: body.name };
    }],
    [(url) => url.includes("/permissions"), () => ({ id: "perm" })],
    [(url) => url.includes("/upload/drive/v3/files?uploadType=resumable"), () => new Response("", { status: 200, headers: { location: "https://upload/session" } })],
    [(url) => url === "https://upload/session", () => ({ id: "file1", md5Checksum: "abc" })],
  ]);
  const drive = new Drive({ token: "t", fetchImpl });
  await upload(data, { manifestDir: dir, drive, root: "Projeto X" });
  assert.deepEqual([...folders.keys()], ["root/Projeto X", "fold1/Facebook", "fold2/2026-11-30"]);
  assert.equal(data.items[0].drive.folder_id, "fold3");
  assert.deepEqual(data.items[0].drive.files["media/card.png"], { id: "file1", url: "https://drive.google.com/file/d/file1/view", md5: "abc" });
  assert.equal(data.review.drive_root_id, "fold1");
  const start = fetchImpl.calls.find((call) => call.url.includes("uploadType=resumable"));
  assert.equal(JSON.parse(start.body).name, "2026-11-30-facebook-1--card.png");
  assert.equal(start.headers["x-upload-content-type"], "image/png");
});

test("Drive upload replaces an existing file in place and skips unchanged content", async () => {
  const dir = tempDir({ "a.png": png(1, 1) });
  const { md5 } = await import("../../.rulesync/skills/social-review/scripts/drive.mjs");
  const same = fakeFetch([[(url) => url.includes("/drive/v3/files?"), () => ({ files: [{ id: "old", md5Checksum: md5(join(dir, "a.png")) }] })]]);
  assert.equal((await new Drive({ token: "t", fetchImpl: same }).upload(join(dir, "a.png"), "F")).unchanged, true);
  const changed = fakeFetch([
    [(url) => url.includes("/drive/v3/files?"), () => ({ files: [{ id: "old", md5Checksum: "different" }] })],
    [(url) => url.includes("/upload/drive/v3/files/old?uploadType=resumable"), () => new Response("", { status: 200, headers: { location: "https://upload/s" } })],
    [(url) => url === "https://upload/s", () => ({ id: "old" })],
  ]);
  await new Drive({ token: "t", fetchImpl: changed }).upload(join(dir, "a.png"), "F");
  assert.equal(changed.calls[1].method, "PATCH");
});

test("fetch downloads approved media into place and checks the checksum", async () => {
  const dir = tempDir({});
  const data = manifest("facebook", [item({ drive: { folder_id: "F", files: { "media/card.png": { id: "X", md5: "900150983cd24fb0d6963f7d28e17f72" } } } })]);
  const path = writeManifest(dir, data);
  const fetchImpl = fakeFetch([[(url) => url.includes("/files/X?alt=media"), () => new Response("abc")]]);
  const report = await fetchMedia(JSON.parse(readFileSync(path, "utf8")), { manifestDir: dir, drive: new Drive({ token: "t", fetchImpl }) });
  assert.deepEqual(report, ["downloaded: media/card.png"]);
  assert.equal(readFileSync(join(dir, "media/card.png"), "utf8"), "abc");
  writeFileSync(join(dir, "media/card.png"), "tampered");
  const bad = fakeFetch([[() => true, () => new Response("zzz")]]);
  await assert.rejects(fetchMedia(data, { manifestDir: dir, drive: new Drive({ token: "t", fetchImpl: bad }) }), /checksum mismatch/);
});

test("set-issue records the issue in the manifest", async () => {
  const { main } = await import("../../.rulesync/skills/social-review/scripts/review-batch.mjs");
  const dir = tempDir({});
  const path = writeManifest(dir, pending([item()]));
  await main(["set-issue", path, "--issue", "12", "--url", "https://github.com/o/r/issues/12"], { out: { write() {} } });
  const saved = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(saved.review.issue_number, 12);
  assert.equal(saved.review.issue_url, "https://github.com/o/r/issues/12");
  await assert.rejects(main(["set-issue", path, "--issue", "x"], { out: { write() {} } }), /needs --issue/);
});

const header = (revision) => `<!-- social-content:batch platform=facebook batch=2026-11-30-facebook revision=${revision} -->`;

function approvalApi({ revision = 1, comments, state = "open", writers = ["ana"] }) {
  const data = pending([item()]);
  data.review.revision = revision;
  return fakeFetch([
    [(url) => url.endsWith("/repos/o/r/issues/9"), () => ({ state, body: `${header(revision)}\n${encodeMarker(data)}` })],
    [(url) => url.includes("/issues/9/comments"), () => comments],
    [(url) => url.includes("/collaborators/"), (url) => ({ role_name: writers.some((login) => url.endsWith(`/${login}/permission`)) ? "write" : "read" })],
  ]);
}

test("approve accepts a writer's /aprove after the last revision and stamps that revision", async () => {
  const { approveFromComment } = await import("../../.rulesync/skills/social-review/scripts/review-batch.mjs");
  const comments = [{ id: 1, body: "<!-- social-content:revision 2 -->", user: { login: "github-actions[bot]", type: "Bot" } }, { id: 2, body: "/aprove", user: { login: "ana", type: "User" }, created_at: "2026-11-28T10:00:00Z" }];
  const approved = await approveFromComment({ repo: "o/r", issue: 9, commentId: 2, token: "t", fetchImpl: approvalApi({ revision: 2, comments }) });
  assert.deepEqual(approved.approval, { status: "approved", by: "ana", at: "2026-11-28T10:00:00.000Z", revision: 2 });
});

test("approve refuses stale, unauthorized, bot, non-command and closed-issue approvals", async () => {
  const { approveFromComment } = await import("../../.rulesync/skills/social-review/scripts/review-batch.mjs");
  const call = (options, commentId) => approveFromComment({ repo: "o/r", issue: 9, commentId, token: "t", fetchImpl: approvalApi(options) });
  const revision = { id: 5, body: "<!-- social-content:revision 2 -->", user: { login: "github-actions[bot]", type: "Bot" } };
  await assert.rejects(call({ revision: 2, comments: [{ id: 1, body: "/aprove", user: { login: "ana", type: "User" } }, revision] }, 1), /predates revision 2/);
  await assert.rejects(call({ comments: [{ id: 1, body: "/aprove", user: { login: "eve", type: "User" } }] }, 1), /eve has no write access/);
  await assert.rejects(call({ comments: [{ id: 1, body: "/aprove", user: { login: "x[bot]", type: "Bot" } }] }, 1), /bots cannot approve/);
  await assert.rejects(call({ comments: [{ id: 1, body: "/aproved later", user: { login: "ana", type: "User" } }] }, 1), /is not \/aprove/);
  await assert.rejects(call({ comments: [], state: "closed" }, 1), /issue 9 is closed/);
  await assert.rejects(call({ revision: 1, comments: [revision, { id: 2, body: "/aprove", user: { login: "ana", type: "User" } }] }, 2), /last revision comment is 2 but the issue body is at 1/);
});

test("a revision comment from a non-writer does not hide earlier /adjust requests", async () => {
  const comments = [
    { id: 1, body: "/adjust a: mude", user: { login: "ana", type: "User" } },
    { id: 2, body: "<!-- social-content:revision 9 -->", user: { login: "eve", type: "User" } },
  ];
  const fetchImpl = fakeFetch([
    [(url) => url.includes("/issues/9/comments"), () => comments],
    [(url) => url.includes("/collaborators/"), (url) => ({ role_name: url.endsWith("/ana/permission") ? "write" : "read" })],
  ]);
  assert.deepEqual((await adjustRequests({ repo: "o/r", issue: 9, token: "t", fetchImpl })).map((r) => r.id), [1]);
});

test("download-folder keeps Drive file names inside the output directory", async () => {
  const { main } = await import("../../.rulesync/skills/social-review/scripts/drive.mjs");
  const dir = tempDir({});
  const fetchImpl = fakeFetch([
    [(url) => url.includes("/drive/v3/files?"), () => ({ files: [{ id: "A", name: "../../evil.mp3", mimeType: "audio/mpeg" }] })],
    [(url) => url.includes("/files/A?alt=media"), () => new Response("x")],
  ]);
  await main(["download-folder", "--folder", "F", "--out", join(dir, "music")], { env: { GOOGLE_API_KEY: "k" }, fetchImpl, out: { write() {} } });
  assert.equal(readFileSync(join(dir, "music", "evil.mp3"), "utf8"), "x");
});

test("the issue shows the music license evidence and the AI disclosure", () => {
  const music = { file: "city.mp3", title: "City Sunshine", author: "Kevin MacLeod", source: "FreePD", license: "CC0", license_url: "https://freepd.com/", evidence: "EVID", sha256: "a".repeat(64) };
  const body = issueBody(pending([item({ music, ai_audio: true })]));
  assert.match(body, /Música: "City Sunshine", Kevin MacLeod, FreePD \(CC0; \[licença\]\(https:\/\/freepd.com\/\); \[evidência\]\(https:\/\/drive.google.com\/file\/d\/EVID\/view\); sha256 `aaaaaaaaaaaa…`\)/);
  assert.match(body, /IA: narração sintética \(rótulo de IA na Meta, aviso no texto do LinkedIn\)/);
});
