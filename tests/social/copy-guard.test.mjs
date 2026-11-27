import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkManifest, checkText, main, profileRules } from "../../.rulesync/skills/copy-guard/scripts/copy-guard.mjs";
import { item, manifest, sink, tempDir, writeManifest } from "./helpers.mjs";

const rules = (text, lang = "pt-BR", options = {}) => checkText(text, { lang, ...options }).map((finding) => `${finding.level}:${finding.rule}`);

test("pt-BR errors for the mechanical tells", () => {
  const cases = {
    "Fecha o mês — emita.": "error:em-dash",
    "✅ Lote pronto\n✅ Recorrência": "error:emoji-bullet",
    "Não é um emissor, é uma ferramenta de lote.": "error:nao-e-x-e-y",
    "Não é só emitir nota.": "error:nao-apenas",
    "E isso muda tudo.": "error:gancho-dramatico",
    "Comente EU QUERO para receber.": "error:isca-de-engajamento",
    "Marque um contador que precisa ver isso.": "error:isca-de-engajamento",
    "Milhares de clientes já emitem aqui.": "error:prova-social",
    "Economize impostos com o plano anual.": "error:promessa-fiscal",
    "Zero rejeição na primeira nota.": "error:promessa-fiscal",
    "Especialistas afirmam que vale a pena.": "error:atribuicao-vaga",
  };
  for (const [text, expected] of Object.entries(cases)) assert.ok(rules(text).includes(expected), `${text} -> ${rules(text)}`);
});

test("pt-BR warnings and broetry", () => {
  assert.ok(rules("Além disso, é fundamental emitir.").includes("warn:vocabulario-ia"));
  assert.ok(rules("O único emissor.").includes("warn:unico"));
  assert.ok(rules("Fechou o mês?\n\nEmita o lote.\n\nSem planilha.").includes("error:broetry"));
  assert.ok(!rules("Fechou o mês? Emita o lote.\n\nNo Nota, cada contrato que se repete vira uma recorrência que você revisa antes de emitir.").includes("error:broetry"));
});

test("clean pt-BR copy with accents, plain bullets and a link passes", () => {
  const text = "Dezembro começa com as notas de novembro. Duas perguntas:\n\n• E a empresa fora do Simples? Depende do município.\n• O emissor do governo é gratuito. Não é obrigatório usar outro.\n\nhttps://example.com/?utm_source=facebook#perguntas\n\n#NFSeNacional";
  assert.deepEqual(rules(text), []);
});

test("English rules run only for English", () => {
  assert.ok(rules("It's not a tool, it's a partner.", "en").includes("error:not-x-but-y"));
  assert.ok(rules("We leverage a robust stack.", "en").includes("error:banned-words"));
  assert.ok(rules("Tag a friend who needs this!", "en").includes("error:engagement-bait"));
  assert.ok(rules("Trusted by thousands of teams.", "en").includes("error:social-proof"));
  assert.ok(rules("Guaranteed to cut your taxes.", "en").includes("error:promise"));
  assert.deepEqual(rules("We leverage the stack.", "pt-BR"), []);
  assert.ok(rules("Hola", "es").includes("warn:language"));
});

test("profile rules add forbidden terms, disable rules and cap hashtags", () => {
  const options = profileRules({ copy_guard: { forbidden: [{ pattern: "\\bDPS\\b", reason: "use numeração das notas" }], disable: ["unico"], max_hashtags: 2 } });
  assert.ok(rules("Configure a DPS.", "pt-BR", options).includes("error:profile-1"));
  assert.ok(!rules("O único.", "pt-BR", options).includes("warn:unico"));
  assert.ok(rules("Texto. #a #b #c", "pt-BR", options).includes("error:hashtag-count"));
});

test("manifest check covers composed text and titles per item; CLI exits 1 on errors", () => {
  const data = manifest("youtube", [item({ type: "short", title: "Isso muda tudo", caption: null, description: "Texto limpo sobre o lote." })]);
  const findings = checkManifest(data);
  assert.deepEqual(findings.map((f) => `${f.where}:${f.rule}`), ["2026-11-30-facebook-1.title:gancho-dramatico"]);
  const dir = tempDir({ "t.txt": "Comente aqui!" , "ok.txt": "Texto simples e direto sobre o produto." });
  const out = sink();
  assert.equal(main(["--text", join(dir, "t.txt")], { out }), 1);
  assert.match(out.text(), /ERROR text: isca-de-engajamento/);
  assert.equal(main(["--text", join(dir, "ok.txt"), "--json"], { out: sink() }), 0);
});

test("fear, urgency and official-endorsement claims are errors in pt-BR", () => {
  for (const text of ["Evite multa: emita hoje.", "Você pode ser multado se atrasar.", "Prazo final chegando.", "Últimos dias para aproveitar o desconto.", "Sistema aprovado pela Receita Federal.", "Emissor credenciado pela SEFIN.", "Conformidade garantida."]) {
    assert.ok(rules(text).includes("error:medo-urgencia"), text);
  }
  for (const text of ["Empresas podem ser multadas.", "Sua empresa pode levar multa.", "Vai levar multa.", "Evite uma multa.", "Última chance.", "Não perca o prazo."]) {
    assert.ok(rules(text).includes("error:medo-urgencia"), text);
  }
  for (const text of ["Nem todas as empresas são obrigadas ao padrão nacional.", "Envie o certificado no gov.br.", "Para que a validação corra bem, confira os dados."]) {
    assert.ok(!rules(text).includes("error:medo-urgencia"), text);
  }
  assert.deepEqual(rules("O prazo do DAS vence em 21/12, segundo a Receita Federal."), []);
  for (const text of ["O prazo final para entrega da DCTFWeb é 15 de março, segundo a Receita Federal.", "Nos últimos dias, a Receita publicou a nota técnica."]) {
    assert.ok(!rules(text).includes("error:medo-urgencia"), text);
  }
  assert.ok(rules("Todas as empresas são obrigadas a usar.").includes("warn:obrigacao-geral"));
  assert.ok(rules("A NFS-e nacional: todas as empresas estão obrigadas desde janeiro (fonte: gov.br).").every((rule) => !rule.startsWith("error:")));
  assert.ok(!rules("Nem todas as empresas são obrigadas ao padrão nacional.").includes("warn:obrigacao-geral"));
});

test("hashtag caps: Instagram allows 5 whatever the profile says; per-platform maps work", async () => {
  const { hashtagCap } = await import("../../.rulesync/skills/copy-guard/scripts/copy-guard.mjs");
  assert.equal(hashtagCap(null, "instagram"), 5);
  assert.equal(hashtagCap(10, "instagram"), 5);
  assert.equal(hashtagCap(3, "instagram"), 3);
  assert.equal(hashtagCap({ facebook: 2, default: 4 }, "facebook"), 2);
  assert.equal(hashtagCap({ default: 4 }, "youtube"), 4);
  assert.equal(hashtagCap(null, "facebook"), null);
  const data = manifest("instagram", [item({ publish_at: null, scheduled: false, caption: "Texto. #a #b #c #d #e #f" , hashtags: [] })]);
  assert.ok(checkManifest(data).some((f) => f.rule === "hashtag-count"));
});

const PROFILE = [
  "# Social content: Test",
  "",
  "## Offer",
  "Plano Escritório por R$ 99 até 31/03/2027 (source: site).",
  "",
  "## Allowed claims",
  "- XML e DANFSE guardados de 30 dias no teste grátis a 5 anos (source: site)",
  "- Tutorial: 9 vídeos curtos, cerca de 8 minutos ao todo (source: site)",
  "",
  "## Forbidden claims",
  "- 40 recorrências por cliente",
  "",
  "## Parameters",
  "",
  "```json",
  JSON.stringify({ language: "pt-BR", calendar_hooks: [{ date: "2026-12-18", hook: "13º salário (2ª parcela) vence na sexta", source: "x" }], copy_guard: { allowed_numbers: ["50 números"] } }),
  "```",
  "",
].join("\n");

test("numeric claims must come from the profile; dates, times, prices and profile numbers pass", async () => {
  const { profileClaims } = await import("../../.rulesync/skills/copy-guard/scripts/copy-guard.mjs");
  const dir = tempDir({ "profile.md": PROFILE });
  const config = { copy_guard: { allowed_numbers: ["50 números"] }, calendar_hooks: [{ date: "2026-12-18", hook: "13º salário (2ª parcela) vence na sexta" }] };
  const allowedClaims = profileClaims(PROFILE, config);
  const with_ = (text, lang = "pt-BR") => rules(text, lang, { allowedClaims });
  assert.ok(with_("Fechamento do mês com 30 recorrências?").includes("error:unsourced-number"));
  for (const text of ["Reduza o tempo em 40%.", "Cadastre 40 recorrências por cliente.", "São 12 empresas na conta.", "Close the month with 30 invoices."]) {
    assert.ok(with_(text, text.startsWith("Close") ? "en" : "pt-BR").includes("error:unsourced-number"), text);
  }
  for (const text of [
    "O XML fica guardado por 30 dias no teste grátis e até 5 anos no Escritório.",
    "O tutorial tem 9 vídeos, cerca de 8 minutos.",
    "O DAS vence em 21/12, às 12:30, ou às 18h.",
    "O Escritório custa R$ 99 até 31 de março de 2027.",
    "O 13º salário vence em 18/12/2026.",
    "Validamos os próximos 50 números.",
    "Em 2027, a NFS-e muda (Lei nº 12.741/2012).",
    "Veja https://example.com/?utm_campaign=organic-2027 #NFSe2026",
    "On December 7, at 6pm, the release goes live.",
  ]) {
    assert.ok(!with_(text, text.startsWith("On") ? "en" : "pt-BR").includes("error:unsourced-number"), `${text} -> ${with_(text)}`);
  }
  assert.ok(rules("Fechamento do mês com 30 recorrências?").includes("warn:unsourced-number"));
  const data = manifest("instagram", [item({ publish_at: null, scheduled: false, caption: "Fechamento do mês com 30 recorrências?", credits: "Voz CC BY 4.0, modelo hifi_tts_92, leitora 92.", hashtags: [] })]);
  const numbers = checkManifest(data, { allowedClaims }).filter((f) => f.rule === "unsourced-number");
  assert.deepEqual(numbers.map((f) => f.level), ["error"]);
  assert.match(numbers[0].excerpt, /30 recorrências/);
  const out = sink();
  writeFileSync(join(dir, "t.txt"), "Fechamento do mês com 30 recorrências?");
  assert.equal(main(["--text", join(dir, "t.txt"), "--profile", join(dir, "profile.md")], { out }), 1);
  assert.match(out.text(), /ERROR text: unsourced-number/);
  writeFileSync(join(dir, "ok.txt"), "Guardamos o XML por 30 dias no teste grátis.");
  assert.equal(main(["--text", join(dir, "ok.txt"), "--profile", join(dir, "profile.md")], { out: sink() }), 0);
});

test("relative day words are errors in cron-published items and Stories, allowed in scheduled items", () => {
  for (const text of ["Hoje, 07/12, sai a release.", "Amanhã o DAS vence.", "Nesta sexta, o 13º.", "Esta semana tem prazo."]) {
    assert.ok(rules(text, "pt-BR", { cron: true }).includes("error:relative-day"), text);
    assert.ok(!rules(text).includes("error:relative-day"), text);
  }
  assert.ok(rules("Tomorrow the release goes live.", "en", { cron: true }).includes("error:relative-day"));
  assert.ok(!rules("Em 07/12 sai a release.", "pt-BR", { cron: true }).includes("error:relative-day"));
  const story = manifest("instagram", [item({ type: "story", publish_at: null, scheduled: false, caption: "Hoje, 07/12, sai a release.", hashtags: [] })]);
  assert.ok(checkManifest(story).some((f) => f.rule === "relative-day" && f.level === "error"));
  const facebook = manifest("facebook", [item({ caption: "Hoje sai a release." })]);
  assert.ok(!checkManifest(facebook).some((f) => f.rule === "relative-day"));
  const unscheduled = manifest("facebook", [item({ scheduled: false, publish_at: null, caption: "Hoje sai a release." })]);
  assert.ok(checkManifest(unscheduled).some((f) => f.rule === "relative-day"));
  const dir = tempDir({ "s.txt": "Amanhã sai a release." });
  assert.equal(main(["--text", join(dir, "s.txt"), "--platform", "instagram"], { out: sink() }), 1);
  assert.equal(main(["--text", join(dir, "s.txt"), "--platform", "facebook"], { out: sink() }), 0);
  assert.equal(main(["--text", join(dir, "s.txt"), "--cron"], { out: sink() }), 1);
});

test("manifest check reads the text drawn in cards and videos from each item's spec", async () => {
  const { profileClaims } = await import("../../.rulesync/skills/copy-guard/scripts/copy-guard.mjs");
  const allowedClaims = profileClaims(PROFILE, {});
  const dir = tempDir({
    "specs/carousel.cards.json": JSON.stringify({ cards: [{ id: "c1", template: "slide", formats: ["ig-portrait"], headline: "Fechamento do mês com 30 recorrências?", alt: "Lista de recorrências" }] }),
    "specs/story.cards.json": JSON.stringify({ cards: [{ id: "s1", formats: ["story"], kicker: "Hoje, 07/12", headline: "Release 1 da NT 009" }] }),
    "specs/reel.video.json": JSON.stringify({ id: "reel", scenes: [{ id: "hook", kind: "hook", title: "Amanhã vence o DAS", voice: "Amanhã vence o DAS.", say: "Amanhã vence o dás." }] }),
  });
  const data = manifest("instagram", [
    item({ id: "carousel", type: "carousel", publish_at: null, scheduled: false, caption: "Texto limpo.", hashtags: [], spec: "specs/carousel.cards.json" }),
    item({ id: "story", type: "story", publish_at: null, scheduled: false, caption: null, hashtags: [], spec: "specs/story.cards.json" }),
    item({ id: "reel", type: "reel", publish_at: null, scheduled: false, caption: "Texto limpo.", hashtags: [], spec: "specs/reel.video.json" }),
  ]);
  const findings = checkManifest(data, { allowedClaims, manifestDir: dir }).filter((f) => f.level === "error").map((f) => `${f.where}:${f.rule}`);
  assert.deepEqual(findings, ["carousel.spec:cards[0].headline:unsourced-number", "story.spec:cards[0].kicker:relative-day", "reel.spec:scenes[0].title:relative-day", "reel.spec:scenes[0].voice:relative-day"]);
  const path = writeManifest(dir, data);
  const out = sink();
  assert.equal(main(["--manifest", path], { out }), 1);
  assert.match(out.text(), /ERROR story\.spec:cards\[0\]\.kicker: relative-day/);
});

test("the same sentence or opening across three items of a batch is a template warning", () => {
  const offer = "Em beta: grátis até 31/03/2027, sem cartão de crédito.";
  const captions = [
    `Recorrência programada. O Nota Profile emite no dia certo. ${offer} Link na bio.`,
    `Lote do mês. O Nota Profile emite todas de uma vez. ${offer} Link na bio.`,
    `Preset por cliente. O Nota Profile testa em homologação. ${offer} Link na bio.`,
  ];
  const data = manifest("instagram", captions.map((caption, index) => item({ id: `i${index}`, caption, hashtags: [] })));
  const batch = checkManifest(data, { profile: null }).filter((f) => f.where === "batch");
  assert.deepEqual(batch.map((f) => [f.level, f.rule, f.excerpt]), [["warn", "repeated-template", offer]]);
  assert.match(batch[0].reason, /a mesma frase em 3 itens \(i0, i1, i2\)/);
  const varied = manifest("instagram", [item({ id: "a", caption: `Dezembro aperta. ${offer}`, hashtags: [] }), item({ id: "b", caption: "O contrato mensal vira recorrência e a nota sai no dia.", hashtags: [] }), item({ id: "c", caption: "Antes de valer, o preset passa pela homologação.", hashtags: [] })]);
  assert.deepEqual(checkManifest(varied, {}).filter((f) => f.where === "batch"), []);
  const openers = manifest("instagram", ["No fechamento do mês, emita o lote.", "No fechamento do mês, revise os valores.", "No fechamento do mês, confira a numeração."].map((caption, index) => item({ id: `o${index}`, caption, hashtags: [] })));
  assert.deepEqual(checkManifest(openers, {}).filter((f) => f.where === "batch").map((f) => f.excerpt), ["No fechamento do"]);
  assert.deepEqual(checkManifest(data, { disabled: new Set(["repeated-template"]) }).filter((f) => f.where === "batch"), []);
});
