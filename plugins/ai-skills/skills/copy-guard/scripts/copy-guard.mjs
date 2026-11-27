#!/usr/bin/env node
// Deterministic checker for the mechanical rules of the copy guard: AI writing tells, engagement bait,
// unsupported social proof, result or savings promises, numbers without a source in the profile, and relative day
// words in items a cron publishes. Language-aware (pt-BR first, English supported) and extendable from the profile.
// Exits 1 when any error-level rule matches.
// Usage:
//   copy-guard.mjs --manifest <manifest.json> [--profile <profile.md>] [--lang pt-BR] [--json]
//   copy-guard.mjs --text <file|-> [--profile <profile.md>] [--lang en] [--platform <name>] [--cron] [--json]
// copy_guard.max_hashtags in the profile is a number or a per-platform map ({"instagram": 5, "default": 5}).
// copy_guard.allowed_numbers lists extra numeric claims ("50 números", or a bare "30" for any context).
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { UNSCHEDULED_PLATFORMS, composeText, isMain, readProfileConfig, resolveMediaPath } from "./social-manifest.mjs";

const EMOJI = "\\p{Extended_Pictographic}";

/** Each rule: id, langs ("all", "pt", "en"), level, pattern (string, flags "giu" by default), reason. */
export const RULES = [
  { id: "em-dash", langs: "all", level: "error", pattern: "—", reason: "travessão/em dash: use vírgula, ponto ou parênteses" },
  { id: "spaced-en-dash", langs: "all", level: "error", pattern: "\\s–\\s", reason: "en dash used as a dash: use a comma or a period" },
  { id: "emoji-bullet", langs: "all", level: "error", pattern: `^\\s*(?:${EMOJI}|[✅✔☑➡▶►◆★✨🔹🔸👉])\\uFE0F?\\s`, flags: "gmu", reason: "emoji or symbol used as a bullet" },
  { id: "curly-quotes", langs: "all", level: "warn", pattern: "[“”‘’]", reason: "curly quotes: use straight quotes" },
  { id: "markdown-bold", langs: "all", level: "warn", pattern: "\\*\\*[^*\\n]+\\*\\*", reason: "markdown bold does not render on social platforms" },
  { id: "exclamations", langs: "all", level: "warn", pattern: "!{2,}", reason: "stacked exclamation marks" },

  // pt-BR: structure and rhetoric
  { id: "nao-e-x-e-y", langs: "pt", level: "error", pattern: "\\bnão (?:é|são|foi|era|se trata de) [^.!?\\n]{1,60}?(?:[,;:.]|\\s[-–]) ?(?:é|são|e sim|mas sim|mas)\\b", reason: "\"não é X, é Y\": afirme Y direto" },
  { id: "nao-apenas", langs: "pt", level: "error", pattern: "\\b(?:não (?:é|são|se trata) (?:só|apenas|somente|sobre)|não só [^.!?\\n]{1,60} mas (?:também)?)\\b", reason: "paralelismo negativo (\"não é apenas...\")" },
  { id: "gancho-dramatico", langs: "pt", level: "error", pattern: "\\b(?:e isso muda tudo|isso muda tudo|por que isso (?:muda tudo|importa)|é aqui que (?:tudo muda|as coisas)|o que ninguém te conta|mas aqui está|spoiler:|plot twist|e o melhor\\?|sabe o que (?:é|isso significa)\\?)", reason: "gancho dramático ou revelação encenada" },
  { id: "isca-de-engajamento", langs: "pt", level: "error", pattern: "\\b(?:coment[ea] (?:aqui|abaixo|ai|aí|sim|eu quero|\"[^\"]+\")|deix[ea] (?:nos comentários|seu comentário|um comentário|seu like)|marqu[ea] (?:um|uma|alguém|aquele|aquela|o seu|a sua|quem)|compartilh[ea] (?:com|se|esse|este)|curta se|d[êe] (?:um )?like|digit[ea] \\S+ nos comentários|manda (?:pra|para) (?:quem|aquele|aquela)|concorda\\?)", reason: "isca de engajamento (pedido de comentário, marcação, curtida ou compartilhamento)" },
  { id: "prova-social", langs: "pt", level: "error", pattern: "\\b(?:(?:milhares|centenas|milhões|dezenas) de (?:notas|clientes|usuários|empresas|pessoas|escritórios|contadores)|escritórios já usam|clientes confiam|depoimentos?|o mais (?:usado|vendido|completo|confiável)|líder (?:de|do|no) mercado|n[º°o]\\s?1\\b|número 1|o melhor (?:do|da) (?:brasil|mercado)|recomendado por especialistas)", reason: "prova social sem evidência" },
  { id: "promessa-fiscal", langs: "pt", level: "error", pattern: "\\b(?:nota sem erro|zero rejei[çc][ãa]o|sem (?:risco de )?multas?|nunca mais (?:erre|errar|multa|pague)|economi[az]\\w* (?:de |no |na |em )?(?:impostos?|tributos?)|pague menos (?:impostos?|tributos?)|reduz\\w* (?:seus |os |o )?(?:impostos?|tributos?)|garant\\w* (?:de )?(?:aprovação|resultado|economia|lucro)|100% (?:seguro|garantido|sem erro))", reason: "promessa de resultado fiscal ou de economia" },
  { id: "medo-urgencia", langs: "pt", level: "error", pattern: "\\b(?:evite (?:a |uma |as )?multas?|(?:pode|podem|vai|vão) (?:ser multad[oa]s?|levar (?:uma )?multas?|pagar (?:uma )?multas?)|prazo final (?:está )?(?:chegando|acabando|se aproxima(?:ndo)?)|últimos dias (?:para|pra) (?:aproveitar|garantir|assinar|contratar|evitar)|última chance|não perca o prazo|corra(?:!|,| antes)|(?:aprovad[oa]|credenciad[oa]|certificad[oa]|homologad[oa]|autorizad[oa]) (?:pela|pelo) (?:receita(?: federal)?|sefin|sefaz|prefeitura|gov\\.br|governo)|conformidade garantida|100% em conformidade)", reason: "medo, urgência ou aval oficial sem fonte: informe o fato e a data com a fonte oficial" },
  { id: "obrigacao-geral", langs: "pt", level: "warn", pattern: "(?<!nem )\\btodas as empresas (?:são|estão) obrigadas", reason: "obrigação generalizada: confirme na fonte oficial a quem se aplica (MEI, Simples, municípios) e cite-a" },
  { id: "atribuicao-vaga", langs: "pt", level: "error", pattern: "\\b(?:especialistas (?:dizem|afirmam|acreditam|recomendam)|estudos (?:mostram|comprovam|apontam|indicam)|pesquisas (?:mostram|comprovam|indicam)|segundo especialistas)\\b", reason: "atribuição vaga: cite a fonte ou corte" },
  { id: "rastro-de-chatbot", langs: "pt", level: "error", pattern: "(?:espero ter ajudado|^claro!|^com certeza!|ótima pergunta|como (?:uma|um) (?:ia|modelo de linguagem))", flags: "gimu", reason: "rastro de conversa com chatbot" },
  { id: "unico", langs: "pt", level: "warn", pattern: "\\b(?:únic[oa]s?|exclusiv[oa]s?)\\b", reason: "\"único\"/\"exclusivo\" pede evidência" },
  { id: "gerundio-raso", langs: "pt", level: "warn", pattern: ", (?:destacando|ressaltando|evidenciando|reforçando|garantindo|refletindo|simbolizando|demonstrando|consolidando|promovendo)\\b", reason: "análise rasa com gerúndio no fim da frase" },
  { id: "vocabulario-ia", langs: "pt", level: "warn", pattern: "\\b(?:além disso|crucial|fundamental|essencial|no cenário atual|no contexto atual|vale (?:destacar|ressaltar|lembrar)|é importante (?:notar|ressaltar|destacar|lembrar)|potencializ\\w*|alavanc\\w*|revolucion\\w*|jornada|transformador\\w*|inovador\\w*|de ponta|robust\\w*|ecossistema|sinergia|desbloqu\\w*|mergulh[eo] (?:fundo|de cabeça)|tapeçaria|um verdadeiro|imperdível|incrível|simplesmente|eleve|elevar)\\b", reason: "vocabulário típico de texto gerado por IA" },
  { id: "preenchimento", langs: "pt", level: "warn", pattern: "\\b(?:com o objetivo de|devido ao fato de|no sentido de|tendo em vista que|de forma a|em virtude de|possui a capacidade de)\\b", reason: "frase de preenchimento" },

  // English
  { id: "not-x-but-y", langs: "en", level: "error", pattern: "\\b(?:(?:it|this|that)(?:'s| is| was) not (?:just |only |merely |about )?[^.!?\\n]{1,60}?[,;:.] ?(?:it|this|that)(?:'s| is)|not (?:just|only|merely) [^.!?\\n]{1,60}?,? but\\b|the (?:question|problem|point) isn'?t [^.!?\\n]{1,40}[,.] ?it'?s)", reason: "binary contrast (\"it's not X, it's Y\"): state Y directly" },
  { id: "throat-clearing", langs: "en", level: "error", pattern: "\\b(?:here'?s the thing|here'?s what (?:i mean|nobody tells you)|let me be clear|the uncomfortable truth|what most people get wrong|the part (?:everyone|most people) (?:misses|skip)|let'?s dive in|plot twist|what if i told you|this changes everything|in today'?s (?:fast-paced |digital )?world|in the age of)\\b", reason: "throat-clearing or staged reveal" },
  { id: "engagement-bait", langs: "en", level: "error", pattern: "\\b(?:comment (?:below|yes|\"[^\"]+\")|drop a comment|let me know in the comments|tag (?:a friend|someone|your)|share (?:this|if)|like if|smash (?:that|the) like|double tap|type \\S+ in the comments|agree\\?)", reason: "engagement bait (asking for comments, tags, likes or shares)" },
  { id: "social-proof", langs: "en", level: "error", pattern: "\\b(?:(?:thousands|millions|hundreds|dozens) of (?:customers|users|companies|businesses|teams|people)|trusted by|loved by|#1\\b|number one|market leader|industry[- ]leading|best[- ]in[- ]class|testimonials?)", reason: "social proof without evidence" },
  { id: "promise", langs: "en", level: "error", pattern: "\\b(?:guarantee[ds]?|(?:save|cut|lower) (?:\\w+ )?(?:on )?(?:your )?taxe?s|zero (?:errors|risk|rejections)|never (?:worry|again)|risk[- ]free|100% (?:safe|accurate|guaranteed))\\b", reason: "result, tax or savings promise" },
  { id: "weasel-attribution", langs: "en", level: "error", pattern: "\\b(?:experts (?:agree|say|believe)|studies show|research shows|industry reports suggest|many (?:argue|believe)|widely regarded as)\\b", reason: "vague attribution: name the source or cut it" },
  { id: "chatbot-trace", langs: "en", level: "error", pattern: "(?:i hope this helps|great question|as an ai\\b|^certainly!|^absolutely!)", flags: "gimu", reason: "chatbot conversation trace" },
  { id: "banned-words", langs: "en", level: "error", pattern: "\\b(?:delve|foster|leverag\\w*|utiliz\\w*|facilitat\\w*|empower\\w*|streamlin\\w*|robust|cutting-edge|paradigm shift|game[- ]changer|tapestry|realm|beacon|multifaceted|meticulous\\w*|intricate|paramount|transformative|elevate|embark|supercharg\\w*|harness|ever-evolving|seamless\\w*|unlock\\w*)\\b", reason: "AI-typical word: use a plain one" },
  { id: "empty-phrase", langs: "en", level: "warn", pattern: "\\b(?:it'?s worth noting|it'?s important to note|at the end of the day|when it comes to|at its core|the reality is|the truth is|in terms of|with regard to|in order to|going forward)\\b", reason: "empty phrase" },
  { id: "empty-adverb", langs: "en", level: "warn", pattern: "\\b(?:literally|truly|fundamentally|crucially|inherently|inevitably)\\b", reason: "often-empty adverb" },

  // Items a cron publishes (Stories, Instagram, LinkedIn, anything not scheduled by the platform) go out on a run whose
  // day is not guaranteed, so words relative to the publication day can be wrong when the post is seen.
  { id: "relative-day", langs: "pt", when: "cron", level: "error", pattern: "\\b(?:hoje|amanhã|amanha|ontem|anteontem|n?(?:esta|essa) semana|n?(?:este|esse) (?:fim de semana|mês)|semana que vem|próxima semana|semana passada|mês que vem|próximo mês|mês passado|n?(?:esta|essa|próxima) (?:segunda|terça|quarta|quinta|sexta)(?:-feira)?|n?(?:este|esse|próximo) (?:sábado|domingo)|daqui a \\d+ dias?)\\b", reason: "dia relativo num item publicado pelo cron (Stories, Instagram, LinkedIn, item sem agendamento): o dia da publicação não é garantido; use a data explícita (07/12) ou um texto sem data" },
  { id: "relative-day", langs: "en", when: "cron", level: "error", pattern: "\\b(?:today|tonight|tomorrow|yesterday|(?:this|next|last) (?:week|weekend|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in \\d+ days?)\\b", reason: "relative day in an item a cron publishes (Stories, Instagram, LinkedIn, unscheduled items): the publication day is not guaranteed; use an explicit date or timeless copy" },
];

/** True when the item goes out on a cron run (no platform scheduling), so its publication day is not guaranteed. */
export function cronPublished(item, platform) {
  return UNSCHEDULED_PLATFORMS.includes(platform) || item.type === "story" || item.scheduled !== true;
}

// ---------- numeric claims ----------

const MONTHS = "janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|january|february|march|april|may|june|july|august|september|october|november|december";

/** Numbers that are not claims: links, tags, dates, years, times, prices, and legal or version identifiers. */
const NOT_CLAIMS = [
  "https?://\\S+",
  "www\\.\\S+",
  "[#@][\\p{L}\\p{N}_]+",
  "\\b\\d{4}-\\d{2}-\\d{2}\\b",
  "\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b",
  `\\b\\d{1,2}[º°]?\\s+de\\s+(?:${MONTHS})(?:\\s+de\\s+\\d{4})?\\b`,
  `\\b(?:${MONTHS})(?:\\s+de)?\\s+\\d{4}\\b`,
  `\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`,
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})(?:,?\\s+\\d{4})?\\b`,
  "(?<!\\p{N}|\\p{N}[.,])(?:19|20)\\d{2}(?!\\p{N}|[.,]\\p{N}|\\s+(?!(?:de|do|da|em|e|a|o|and|to|in|on)\\b)\\p{Ll})",
  "\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\b",
  "\\b\\d{1,2}h(?:\\d{2})?(?:min)?\\b",
  "\\b\\d{1,2}\\s?(?:am|pm)\\b",
  "(?:R\\$|US\\$|\\$|€|£)\\s?\\d[\\d.,]*",
  "\\b\\d[\\d.,]*\\s?(?:reais|real|dólares|dólar|dollars?|euros?|centavos|cents?)\\b",
  "(?:\\bn\\.?\\s?[º°]|\\b(?:lei|art\\.?|artigo|resolução|decreto|portaria|nt|release|versão|version|v\\.?)\\s*)\\s*\\d[\\d.,/-]*",
];
const NUMBER = /(?<![\p{L}\p{N}_])\d+(?:[.,]\d+)*(?:\s?%|[º°ª])?(?![\p{L}\p{N}_])/gu;
const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "com", "em", "no", "na", "nos", "nas", "por", "para", "pra", "ate", "e", "a", "o", "as", "os", "um", "uma", "cerca", "mais", "menos", "apenas", "so", "the", "of", "for", "with", "to", "in", "on", "at", "by", "up", "and", "an", "about", "over", "under", "than", "only"]);

const fold = (word) => (word ? word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/s$/, "") : null);
const sameWord = (a, b) => Boolean(a && b) && (a === b || (Math.min(a.length, b.length) >= 3 && Math.abs(a.length - b.length) <= 2 && (a.startsWith(b) || b.startsWith(a))));

/** Every numeric claim in a text: its value, the word after it ("%" for percentages) and the word before it. */
export function numericClaims(text, exclude = []) {
  let masked = String(text);
  const blank = (match) => " ".repeat(match.length);
  for (const literal of exclude.filter(Boolean)) masked = masked.split(literal).join(blank(literal));
  for (const pattern of NOT_CLAIMS) masked = masked.replace(compile({ pattern }), blank);
  const claims = [];
  for (const match of masked.matchAll(NUMBER)) {
    const percent = /%$/.test(match[0]);
    const value = match[0].replace(/\s?%$|[º°ª]$/u, "");
    const next = percent ? "%" : fold(masked.slice(match.index + match[0].length).match(/^\s*(\p{L}+)/u)?.[1]);
    const prev = fold(masked.slice(0, match.index).match(/(\p{L}+)\s*$/u)?.[1]);
    claims.push({ value, next, prev, index: match.index, length: match[0].length });
  }
  return claims;
}

/** Numbers the profile allows: its Offer, Allowed claims, and Calendar hooks sections, calendar_hooks, and copy_guard.allowed_numbers. */
export function profileClaims(profileText, config = null) {
  const sections = [];
  const text = String(profileText ?? "");
  for (const match of text.matchAll(/^##\s+(?:Offer|Allowed claims|Calendar hooks)\b[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/gim)) sections.push(match[1]);
  for (const hook of config?.calendar_hooks ?? []) sections.push(hook.hook ?? "");
  const claims = sections.flatMap((section) => numericClaims(section));
  for (const entry of config?.copy_guard?.allowed_numbers ?? []) {
    for (const claim of numericClaims(String(entry))) claims.push({ ...claim, bare: !claim.next && !claim.prev });
  }
  return claims;
}

function claimAllowed(claim, allowed) {
  const prev = claim.prev && !STOPWORDS.has(claim.prev) ? claim.prev : null;
  return allowed.some((entry) => entry.value === claim.value && (entry.bare || (!claim.next && !prev) || sameWord(entry.next, claim.next) || sameWord(entry.prev, prev)));
}

/** Numbers (counts, percentages, amounts, durations) not found in the profile's allowed claims. */
function unsourcedNumbers(text, { group, allowedClaims, exclude, where }) {
  const reason = allowedClaims
    ? group === "pt"
      ? "número sem fonte no perfil (Allowed claims, Offer, Calendar hooks ou copy_guard.allowed_numbers): use um número do perfil ou corte"
      : "number not in the profile (Allowed claims, Offer, Calendar hooks, or copy_guard.allowed_numbers): use a profile number or cut it"
    : "number not checked against a profile (pass --profile): confirm it is in the allowed claims";
  return numericClaims(text, exclude)
    .filter((claim) => !claimAllowed(claim, allowedClaims ?? []))
    .map((claim) => ({ where, rule: "unsourced-number", level: allowedClaims ? "error" : "warn", reason, excerpt: excerpt(text, claim.index, claim.length) }));
}

export function languageGroup(lang = "pt-BR") {
  const base = String(lang).toLowerCase().slice(0, 2);
  return base === "pt" ? "pt" : base === "en" ? "en" : "other";
}

// JavaScript's \b is ASCII-only even with the u flag, so "é" would not end a word. Use a Unicode boundary.
const WORD = "[\\p{L}\\p{N}_]";
const BOUNDARY = `(?:(?<!${WORD})(?=${WORD})|(?<=${WORD})(?!${WORD}))`;

export function compile(rule) {
  const flags = rule.flags ?? "giu";
  return new RegExp(rule.pattern.replaceAll("\\b", BOUNDARY), flags.includes("u") ? flags : `${flags}u`);
}

/** Broetry: three or more one-sentence paragraphs (or lines) in a row, each short. */
function broetry(text) {
  const blocks = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).filter((line) => !/^#/.test(line) && !/^https?:\/\//.test(line));
  let run = 0;
  let longest = 0;
  for (const block of blocks) {
    const sentences = block.split(/(?<=[.!?])\s+/).filter(Boolean);
    const words = block.split(/\s+/).length;
    run = sentences.length === 1 && words <= 12 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest >= 3;
}

function excerpt(text, index, length) {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 20);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

export function profileRules(config) {
  const guard = config?.copy_guard ?? {};
  const extra = (guard.forbidden ?? []).map((entry, index) => ({
    id: entry.id ?? `profile-${index + 1}`,
    langs: entry.langs ?? "all",
    level: entry.level ?? "error",
    pattern: entry.pattern,
    flags: entry.flags,
    reason: entry.reason ?? "forbidden by the project profile",
  }));
  return { extra, disabled: new Set(guard.disable ?? []), maxHashtags: guard.max_hashtags ?? null, maxEmoji: guard.max_emoji ?? 3 };
}

/** Platform caps that apply whatever the profile says (Instagram allows 5 hashtags since December 2025). */
export const PLATFORM_MAX_HASHTAGS = { instagram: 5 };

/** Effective hashtag cap: the profile's number, or its per-platform map, never above the platform's own cap. */
export function hashtagCap(maxHashtags, platform) {
  const fromProfile = maxHashtags !== null && typeof maxHashtags === "object" ? maxHashtags[platform] ?? maxHashtags.default ?? null : maxHashtags;
  const fromPlatform = PLATFORM_MAX_HASHTAGS[platform] ?? null;
  if (fromProfile === null || fromProfile === undefined) return fromPlatform;
  return fromPlatform === null ? fromProfile : Math.min(fromProfile, fromPlatform);
}

export function checkText(text, { lang = "pt-BR", extra = [], disabled = new Set(), maxHashtags = null, maxEmoji = 3, where = "text", cron = false, allowedClaims = null, exclude = [] } = {}) {
  const group = languageGroup(lang);
  const findings = [];
  for (const rule of [...RULES, ...extra]) {
    if (disabled.has(rule.id)) continue;
    if (rule.when === "cron" && !cron) continue;
    if (rule.langs !== "all" && rule.langs !== group) continue;
    for (const match of text.matchAll(compile(rule))) {
      findings.push({ where, rule: rule.id, level: rule.level, reason: rule.reason, excerpt: excerpt(text, match.index, match[0].length) });
    }
  }
  if (!disabled.has("unsourced-number")) findings.push(...unsourcedNumbers(text, { group, allowedClaims, exclude, where }));
  if (!disabled.has("broetry") && broetry(text)) findings.push({ where, rule: "broetry", level: "error", reason: group === "pt" ? "broetry: frases soltas, uma por linha; junte em parágrafos" : "broetry: one short sentence per line; write paragraphs", excerpt: "" });
  const emoji = text.match(new RegExp(EMOJI, "gu")) ?? [];
  if (!disabled.has("emoji-count") && emoji.length > maxEmoji) findings.push({ where, rule: "emoji-count", level: "warn", reason: `more than ${maxEmoji} emoji`, excerpt: emoji.join(" ") });
  const hashtags = text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? [];
  if (maxHashtags !== null && hashtags.length > maxHashtags) findings.push({ where, rule: "hashtag-count", level: "error", reason: `more than ${maxHashtags} hashtags`, excerpt: hashtags.join(" ").trim() });
  if (group === "other") findings.push({ where, rule: "language", level: "warn", reason: `no language-specific rules for ${lang}; only the universal ones ran`, excerpt: "" });
  return findings;
}

const CARD_FIELDS = ["kicker", "headline", "lead", "badge", "image_label", "alt", "footer"];
const SCENE_FIELDS = ["title", "headline", "body", "voice", "label", "url"];

/** Text drawn in an item's media: cards spec (cards[]) or video spec (scenes[] and footnote). Pronunciation (`say`) is not shown. */
export function specFields(spec) {
  const fields = [];
  (spec?.cards ?? []).forEach((card, index) => {
    for (const key of CARD_FIELDS) if (typeof card[key] === "string" && card[key]) fields.push([`spec:cards[${index}].${key}`, card[key]]);
  });
  (spec?.scenes ?? []).forEach((scene, index) => {
    for (const key of SCENE_FIELDS) if (typeof scene[key] === "string" && scene[key]) fields.push([`spec:scenes[${index}].${key}`, scene[key]]);
  });
  if (typeof spec?.footnote === "string" && spec.footnote) fields.push(["spec:footnote", spec.footnote]);
  return fields;
}

function itemSpecFields(item, manifestDir) {
  if (!item.spec || !manifestDir) return [];
  const path = resolveMediaPath(manifestDir, item.spec);
  if (!path || !existsSync(path)) return [["spec", null]];
  return specFields(JSON.parse(readFileSync(path, "utf8")));
}

const fold4 = (text) => text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}/]+/gu, " ").trim();

/**
 * Batch-level template check: the same sentence (four words or more) or the same three-word opening in the text of
 * three or more items reads as one template filled in many times. Warnings: vary them, or keep a deliberate one.
 */
export function repeatedTemplates(manifest, { lang = manifest.language, minItems = 3 } = {}) {
  const pt = languageGroup(lang) === "pt";
  const sentences = new Map();
  const openings = new Map();
  for (const item of manifest.items ?? []) {
    let text = composeText(item, manifest.platform, manifest.language);
    if (item.credits) text = text.replace(item.credits, "");
    const parts = text.split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter((part) => part && !/^#/.test(part) && !/^https?:\/\//.test(part));
    for (const part of new Set(parts)) {
      const key = fold4(part);
      if (key.split(" ").length < 4) continue;
      if (!sentences.has(key)) sentences.set(key, { text: part, ids: new Set() });
      sentences.get(key).ids.add(item.id);
    }
    const opening = fold4(parts[0] ?? "").split(" ").slice(0, 3).join(" ");
    if (opening.split(" ").length === 3) {
      if (!openings.has(opening)) openings.set(opening, { text: (parts[0] ?? "").split(/\s+/).slice(0, 3).join(" "), ids: new Set() });
      openings.get(opening).ids.add(item.id);
    }
  }
  const findings = [];
  for (const { text, ids } of sentences.values()) {
    if (ids.size >= minItems) findings.push({ where: "batch", rule: "repeated-template", level: "warn", reason: pt ? `a mesma frase em ${ids.size} itens (${[...ids].join(", ")}): varie a estrutura e o fechamento entre os posts, ou mantenha em um só` : `the same sentence in ${ids.size} items (${[...ids].join(", ")}): vary structure and closing across posts, or keep it in one`, excerpt: text });
  }
  for (const { text, ids } of openings.values()) {
    if (ids.size >= minItems) findings.push({ where: "batch", rule: "repeated-template", level: "warn", reason: pt ? `${ids.size} itens abrem do mesmo jeito (${[...ids].join(", ")}): varie o gancho` : `${ids.size} items open the same way (${[...ids].join(", ")}): vary the hook`, excerpt: text });
  }
  return findings;
}

export function checkManifest(manifest, options = {}) {
  const findings = [];
  const { manifestDir = null, ...rest } = options;
  options = rest;
  for (const item of manifest.items) {
    const fields = [["text", composeText(item, manifest.platform, manifest.language)], ["title", item.title ?? ""], ["first_comment", item.options?.first_comment ?? ""]];
    for (const media of item.media ?? []) if (media.alt) fields.push([`alt:${media.path}`, media.alt]);
    for (const [field, text] of itemSpecFields(item, manifestDir)) {
      if (text === null) findings.push({ where: `${item.id}.spec`, rule: "spec", level: "warn", reason: `spec not found: ${item.spec}; the text drawn in its media was not checked`, excerpt: "" });
      else fields.push([field, text]);
    }
    for (const [field, text] of fields) {
      if (!text) continue;
      const scoped = { ...options, lang: options.lang ?? manifest.language, where: `${item.id}.${field}`, maxHashtags: hashtagCap(options.maxHashtags ?? null, manifest.platform), cron: cronPublished(item, manifest.platform), exclude: [item.credits] };
      findings.push(...checkText(text, field === "text" ? scoped : { ...scoped, maxHashtags: null }).filter((f) => field === "text" || f.rule !== "broetry"));
    }
  }
  if (!options.disabled?.has("repeated-template")) findings.push(...repeatedTemplates(manifest, { lang: options.lang ?? manifest.language }));
  return findings;
}

export function format(findings) {
  if (!findings.length) return "copy guard: no findings\n";
  const lines = findings.map((f) => `${f.level.toUpperCase()} ${f.where}: ${f.rule}${f.excerpt ? ` "${f.excerpt}"` : ""} (${f.reason})`);
  const errors = findings.filter((f) => f.level === "error").length;
  return `${lines.join("\n")}\ncopy guard: ${errors} error(s), ${findings.length - errors} warning(s)\n`;
}

export function main(argv, { out = process.stdout, readStdin = () => readFileSync(0, "utf8") } = {}) {
  const value = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const config = value("profile") ? readProfileConfig(value("profile")) : null;
  const { extra, disabled, maxHashtags, maxEmoji } = profileRules(config);
  const allowedClaims = config ? profileClaims(readFileSync(value("profile"), "utf8"), config) : null;
  const options = { lang: value("lang") ?? config?.language, extra, disabled, maxHashtags, maxEmoji, allowedClaims };
  let findings;
  if (value("manifest")) findings = checkManifest(JSON.parse(readFileSync(value("manifest"), "utf8")), { ...options, manifestDir: dirname(value("manifest")) });
  else if (value("text")) {
    const cron = argv.includes("--cron") || UNSCHEDULED_PLATFORMS.includes(value("platform"));
    findings = checkText(value("text") === "-" ? readStdin() : readFileSync(value("text"), "utf8"), { ...options, lang: options.lang ?? "pt-BR", maxHashtags: hashtagCap(maxHashtags, value("platform") ?? null), cron });
  } else {
    process.stderr.write("usage: copy-guard.mjs (--manifest <file> | --text <file|->) [--profile <md>] [--lang <code>] [--platform <name>] [--cron] [--json]\n");
    return 2;
  }
  out.write(argv.includes("--json") ? `${JSON.stringify(findings, null, 2)}\n` : format(findings));
  return findings.some((f) => f.level === "error") ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
