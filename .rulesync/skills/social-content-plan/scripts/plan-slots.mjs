#!/usr/bin/env node
// Turns a platform's Parameters (days, times, time zone, frequency, blackout dates, calendar hooks) into the dated
// publication slots of the next batch, and optionally writes a skeleton manifest for the agent to fill.
// Usage: plan-slots.mjs --profile <profile.md> --platform <facebook|instagram|youtube|linkedin> [--start YYYY-MM-DD]
//        [--days N] [--now ISO] [--init <batch-dir>]
// Default start: the Monday after --now in the profile's time zone; default window: 7 days.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMain, localIso, readProfileConfig, UNSCHEDULED_PLATFORMS, zoneOffset } from "./social-manifest.mjs";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export class PlanError extends Error {}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function localDate(now, timeZone) {
  const offset = zoneOffset(timeZone, now);
  const sign = offset.startsWith("-") ? -1 : 1;
  const [h, m] = offset.slice(1).split(":").map(Number);
  return new Date(now.getTime() + sign * (h * 60 + m) * 60000).toISOString().slice(0, 10);
}

export function nextMonday(now, timeZone) {
  const today = localDate(now, timeZone);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, ((8 - weekday) % 7) || 7);
}

export function platformSettings(config, platform) {
  const settings = config.platforms?.[platform];
  if (!settings) throw new PlanError(`the profile has no platforms.${platform} parameters`);
  if (settings.enabled === false) throw new PlanError(`platforms.${platform} is disabled in the profile`);
  return {
    timezone: settings.timezone ?? config.timezone ?? "UTC",
    language: settings.language ?? config.language ?? "pt-BR",
    days: (settings.days ?? ["mon", "wed", "fri"]).map((day) => day.toLowerCase().slice(0, 3)),
    times: settings.times ?? ["12:00"],
    perBatch: settings.per_batch ?? null,
    scheduled: UNSCHEDULED_PLATFORMS.includes(platform) ? false : settings.scheduled ?? true,
    visibility: settings.visibility ?? "public",
    formats: settings.formats ?? (platform === "youtube" ? ["short"] : ["photo"]),
    images: settings.images ?? platform !== "youtube",
    video: settings.video ?? platform === "youtube",
    blackout: new Set([...(config.blackout_dates ?? []), ...(settings.blackout_dates ?? [])].map((entry) => (typeof entry === "string" ? entry : entry.date))),
    blackoutReasons: Object.fromEntries([...(config.blackout_dates ?? []), ...(settings.blackout_dates ?? [])].filter((entry) => typeof entry === "object").map((entry) => [entry.date, entry.reason ?? "blackout"])),
    hooks: config.calendar_hooks ?? [],
  };
}

export function planSlots(config, platform, { now = new Date(), start = null, days = 7 } = {}) {
  const settings = platformSettings(config, platform);
  if (!/^\d{2}:\d{2}$/.test(settings.times[0] ?? "")) throw new PlanError("times must be HH:MM");
  const first = start ?? nextMonday(now, settings.timezone);
  const slots = [];
  const skipped = [];
  for (let index = 0; index < days; index += 1) {
    const date = addDays(first, index);
    const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
    if (!settings.days.includes(weekday)) continue;
    if (settings.blackout.has(date)) {
      skipped.push({ date, reason: settings.blackoutReasons[date] ?? "blackout or holiday listed in the profile" });
      continue;
    }
    for (const time of settings.times) {
      const publishAt = localIso(date, time, settings.timezone);
      if (Date.parse(publishAt) - now.getTime() < 10 * 60 * 1000) {
        skipped.push({ date, reason: `${time} is less than 10 minutes from now` });
        continue;
      }
      slots.push({ date, weekday, time, publish_at: UNSCHEDULED_PLATFORMS.includes(platform) ? null : publishAt });
    }
  }
  const limited = settings.perBatch ? slots.slice(0, settings.perBatch) : slots;
  const end = addDays(first, days - 1);
  const hooks = settings.hooks.filter((hook) => hook.date >= first && hook.date <= end);
  const warnings = [];
  if (platform === "facebook" && limited.some((slot) => Date.parse(slot.publish_at) - now.getTime() > 30 * 24 * 3600 * 1000)) warnings.push("some slots are more than 30 days ahead; Facebook cannot schedule them yet");
  return {
    platform,
    timezone: settings.timezone,
    language: settings.language,
    publication_date: limited[0]?.date ?? first,
    window: { start: first, end },
    defaults: { scheduled: settings.scheduled, visibility: settings.visibility, formats: settings.formats, images: settings.images, video: settings.video },
    slots: limited,
    skipped,
    hooks,
    warnings,
  };
}

export function skeletonManifest(plan, { profile = null, generator = null, now = new Date() } = {}) {
  return {
    schema_version: 1,
    platform: plan.platform,
    batch_id: `${plan.publication_date}-${plan.platform}`,
    publication_date: plan.publication_date,
    timezone: plan.timezone,
    language: plan.language,
    profile,
    created_at: now.toISOString(),
    generator,
    items: plan.slots.map((slot, index) => ({
      id: `${slot.date}-${plan.platform}-${index + 1}`,
      type: plan.defaults.formats[index % plan.defaults.formats.length],
      date: slot.date,
      publish_at: slot.publish_at,
      scheduled: plan.defaults.scheduled,
      visibility: plan.defaults.visibility,
      title: null,
      caption: plan.platform === "youtube" ? null : "",
      description: plan.platform === "youtube" ? "" : null,
      hashtags: [],
      tags: [],
      link: null,
      media: [],
      thumbnail: null,
      credits: null,
      synthetic_media: false,
      sources: [],
    })),
    approval: { status: "pending", by: null, at: null, revision: null },
    review: { issue_number: null, issue_url: null, revision: 1, drive_root_id: null, history: [] },
    state: {},
  };
}

export function main(argv, { out = process.stdout } = {}) {
  const value = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (!value("profile") || !value("platform")) {
    process.stderr.write("usage: plan-slots.mjs --profile <profile.md> --platform <name> [--start YYYY-MM-DD] [--days N] [--now ISO] [--init <batch-dir>]\n");
    return 2;
  }
  try {
    const config = readProfileConfig(value("profile"));
    const now = value("now") ? new Date(value("now")) : new Date();
    const plan = planSlots(config, value("platform"), { now, start: value("start") ?? null, days: Number(value("days") ?? 7) });
    if (value("init")) {
      const dir = value("init");
      const path = join(dir, "manifest.json");
      if (existsSync(path)) throw new PlanError(`${path} already exists; adjust it instead of starting over`);
      mkdirSync(join(dir, "media"), { recursive: true });
      writeFileSync(path, `${JSON.stringify(skeletonManifest(plan, { profile: value("profile"), now }), null, 2)}\n`);
      plan.manifest = path;
    }
    out.write(`${JSON.stringify(plan, null, 2)}\n`);
    return plan.slots.length ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
