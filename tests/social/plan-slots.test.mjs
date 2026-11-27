import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main, nextMonday, planSlots, skeletonManifest } from "../../.rulesync/skills/social-content-plan/scripts/plan-slots.mjs";
import { validateManifest } from "../../shared/scripts/social-manifest.mjs";
import { NOW, sink, tempDir } from "./helpers.mjs";

const config = {
  timezone: "America/Sao_Paulo",
  language: "pt-BR",
  blackout_dates: [{ date: "2026-12-02", reason: "feriado municipal" }, "2026-12-25"],
  calendar_hooks: [{ date: "2026-12-01", hook: "competência de novembro", source: "https://gov.example" }, { date: "2027-01-05", hook: "fora", source: "x" }],
  platforms: {
    facebook: { days: ["mon", "tue", "wed", "thu", "fri"], times: ["12:30"], formats: ["photo", "post"], per_batch: 3 },
    instagram: { days: ["mon", "wed", "fri"], times: ["12:00"], formats: ["photo"] },
    youtube: { days: ["thu"], times: ["18:00"], formats: ["short"], enabled: true },
    linkedin: { enabled: false },
  },
};

test("the batch starts the Monday after now, in the profile time zone", () => {
  assert.equal(nextMonday(NOW, "America/Sao_Paulo"), "2026-11-30");
  assert.equal(nextMonday(new Date("2026-11-30T02:00:00Z"), "America/Sao_Paulo"), "2026-11-30");
});

test("slots follow days and times, skip blackouts, and respect per_batch", () => {
  const plan = planSlots(config, "facebook", { now: NOW });
  assert.deepEqual(plan.slots.map((slot) => slot.publish_at), ["2026-11-30T12:30:00-03:00", "2026-12-01T12:30:00-03:00", "2026-12-03T12:30:00-03:00"]);
  assert.deepEqual(plan.skipped, [{ date: "2026-12-02", reason: "feriado municipal" }]);
  assert.deepEqual(plan.hooks.map((hook) => hook.date), ["2026-12-01"]);
  assert.equal(plan.defaults.scheduled, true);
});

test("Instagram slots have no publish_at and are never scheduled", () => {
  const plan = planSlots(config, "instagram", { now: NOW });
  assert.deepEqual(plan.slots.map((slot) => [slot.date, slot.publish_at]), [["2026-11-30", null], ["2026-12-04", null]]);
  assert.equal(plan.defaults.scheduled, false);
});

test("disabled or missing platforms fail clearly", () => {
  assert.throws(() => planSlots(config, "linkedin"), /disabled/);
  assert.throws(() => planSlots({}, "facebook"), /no platforms.facebook/);
});

test("the skeleton manifest matches the schema and needs content before it validates", () => {
  const data = skeletonManifest(planSlots(config, "youtube", { now: NOW }), { now: NOW });
  assert.equal(data.batch_id, "2026-12-03-youtube");
  const errors = validateManifest(data, { manifestDir: ".", now: NOW });
  assert.ok(errors.every((error) => !error.startsWith("$")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("title is required")));
});

test("CLI --init writes the batch directory once", () => {
  const dir = tempDir({ "p.md": `## Parameters\n\n\`\`\`json\n${JSON.stringify(config)}\n\`\`\`\n` });
  const batch = join(dir, "batch");
  assert.equal(main(["--profile", join(dir, "p.md"), "--platform", "facebook", "--now", NOW.toISOString(), "--init", batch], { out: sink() }), 0);
  assert.equal(JSON.parse(readFileSync(join(batch, "manifest.json"), "utf8")).items.length, 3);
  assert.equal(main(["--profile", join(dir, "p.md"), "--platform", "facebook", "--now", NOW.toISOString(), "--init", batch], { out: sink() }), 1);
});
