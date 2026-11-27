#!/usr/bin/env node
// Deterministic checker for the mechanical rules of the copy guard: AI writing tells, engagement bait,
// unsupported social proof, and result or savings promises. Language-aware (pt-BR first, English supported) and
// extendable from the profile. Exits 1 when any error-level rule matches.
// Usage:
//   copy-guard.mjs --manifest <manifest.json> [--profile <profile.md>] [--lang pt-BR] [--json]
//   copy-guard.mjs --text <file|-> [--profile <profile.md>] [--lang en] [--json]
import { readFileSync } from "node:fs";
import { composeText, isMain, readProfileConfig } from "./social-manifest.mjs";

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
];

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

export function checkText(text, { lang = "pt-BR", extra = [], disabled = new Set(), maxHashtags = null, maxEmoji = 3, where = "text" } = {}) {
  const group = languageGroup(lang);
  const findings = [];
  for (const rule of [...RULES, ...extra]) {
    if (disabled.has(rule.id)) continue;
    if (rule.langs !== "all" && rule.langs !== group) continue;
    for (const match of text.matchAll(compile(rule))) {
      findings.push({ where, rule: rule.id, level: rule.level, reason: rule.reason, excerpt: excerpt(text, match.index, match[0].length) });
    }
  }
  if (!disabled.has("broetry") && broetry(text)) findings.push({ where, rule: "broetry", level: "error", reason: group === "pt" ? "broetry: frases soltas, uma por linha; junte em parágrafos" : "broetry: one short sentence per line; write paragraphs", excerpt: "" });
  const emoji = text.match(new RegExp(EMOJI, "gu")) ?? [];
  if (!disabled.has("emoji-count") && emoji.length > maxEmoji) findings.push({ where, rule: "emoji-count", level: "warn", reason: `more than ${maxEmoji} emoji`, excerpt: emoji.join(" ") });
  const hashtags = text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? [];
  if (maxHashtags !== null && hashtags.length > maxHashtags) findings.push({ where, rule: "hashtag-count", level: "error", reason: `more than ${maxHashtags} hashtags`, excerpt: hashtags.join(" ").trim() });
  if (group === "other") findings.push({ where, rule: "language", level: "warn", reason: `no language-specific rules for ${lang}; only the universal ones ran`, excerpt: "" });
  return findings;
}

export function checkManifest(manifest, options = {}) {
  const findings = [];
  for (const item of manifest.items) {
    const fields = [["text", composeText(item, manifest.platform)], ["title", item.title ?? ""], ["first_comment", item.options?.first_comment ?? ""]];
    for (const media of item.media ?? []) if (media.alt) fields.push([`alt:${media.path}`, media.alt]);
    for (const [field, text] of fields) {
      if (!text) continue;
      const scoped = { ...options, lang: options.lang ?? manifest.language, where: `${item.id}.${field}` };
      findings.push(...checkText(text, field === "text" ? scoped : { ...scoped, maxHashtags: null }).filter((f) => field === "text" || f.rule !== "broetry"));
    }
  }
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
  const options = { lang: value("lang") ?? config?.language, extra, disabled, maxHashtags, maxEmoji };
  let findings;
  if (value("manifest")) findings = checkManifest(JSON.parse(readFileSync(value("manifest"), "utf8")), options);
  else if (value("text")) findings = checkText(value("text") === "-" ? readStdin() : readFileSync(value("text"), "utf8"), { ...options, lang: options.lang ?? "pt-BR" });
  else {
    process.stderr.write("usage: copy-guard.mjs (--manifest <file> | --text <file|->) [--profile <md>] [--lang <code>] [--json]\n");
    return 2;
  }
  out.write(argv.includes("--json") ? `${JSON.stringify(findings, null, 2)}\n` : format(findings));
  return findings.some((f) => f.level === "error") ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
