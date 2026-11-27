import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { checkManifest, checkText, main, profileRules } from "../../.rulesync/skills/copy-guard/scripts/copy-guard.mjs";
import { item, manifest, sink, tempDir } from "./helpers.mjs";

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
  for (const text of ["Evite multa: emita hoje.", "Você pode ser multado se atrasar.", "Prazo final chegando.", "Todas as empresas são obrigadas a usar.", "Sistema aprovado pela Receita Federal.", "Emissor credenciado pela SEFIN.", "Conformidade garantida."]) {
    assert.ok(rules(text).includes("error:medo-urgencia"), text);
  }
  assert.deepEqual(rules("O prazo do DAS vence em 21/12, segundo a Receita Federal."), []);
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
