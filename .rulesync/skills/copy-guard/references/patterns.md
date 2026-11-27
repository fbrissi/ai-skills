# Patterns for the detect-only review

Load this in step 2 of the copy guard. These are the patterns a regex misses. For each one found, quote the line and give the fix in a few words. Adapted from `humanizer-pt-br` (mackswendhell, MIT, based on Wikipedia's "Signs of AI writing") and the detect mode of `no-ai-slop` (Peter Yang, MIT).

## Both languages

| Pattern | What it looks like | Fix |
|---|---|---|
| Rule of three | "rápido, simples e seguro"; "faster, simpler, safer" stacked for rhythm | Keep the one or two that are true and specific |
| Synonym cycling | "o sistema… a plataforma… a ferramenta" for the same thing | Repeat the clear word |
| Gerund or -ing tail | ", garantindo mais controle"; ", highlighting its value" | Say the concrete consequence, or cut |
| Importance puffery | "marca um novo momento", "papel fundamental", "a testament to" | State the fact |
| Promotional tone | "incrível", "revolucionário", "poderoso", "seamless" | Describe what it does |
| Portability test | A sentence that fits any product unchanged | Replace with a fact, mechanism, or example specific to this one |
| Telling, not showing | "isso é importante porque…", "this matters" | Show the fact that makes it matter |
| Vague ending | "o futuro é promissor", "the possibilities are endless" | End on the last concrete point or the call to action |
| Summary ending | "Em resumo…", "In short…" restating the post | Cut it |
| Rhetorical setup | "E se eu te dissesse…", "What if I told you", self-answered "Question? Answer." | Make the point |
| Colon reveal | "O segredo: …", "The best part: it learns." | Write a plain sentence |
| Over-hedging | "pode potencialmente ajudar a talvez reduzir" | One hedge, or none when the source supports it |
| False range | "de A a Z", "from startups to enterprises" without a real spectrum | Name the real cases |
| Formatting decoration | Emoji in every line, bold mid-sentence, bullets for two short sentences | Plain prose |
| Uniform rhythm | Every sentence the same length and shape | Vary length where it helps |

## pt-BR specifics

- Title Case em títulos ("Emissão Em Lote Para Escritórios"): só a primeira palavra e nomes próprios com maiúscula.
- Conectivos de redação ("além disso", "no entanto", "portanto") em sequência: corte a maioria.
- Frases de preenchimento: "com o objetivo de" → "para"; "devido ao fato de" → "porque"; "possui a capacidade de" → o verbo direto.
- Evasão do "ser": "atua como", "serve como", "conta com" quando "é" ou "tem" bastam.
- Tom de folder: "localizado no coração de", "rico em", "de tirar o fôlego".

## English specifics

- Throat-clearing and faux-insight openers ("Here's the thing", "What most people get wrong").
- Weak verb phrases ("made a decision" → "decided", "has the ability to" → "can").
- Interpretive asides ("That last part matters more than it sounds").

## Claims (both languages)

- Every number, customer, result, saving, ranking, or comparison must appear in the item's `sources` and in the profile's allowed claims. Otherwise flag it as `unsupported claim` and cut it.
- Dates, prices, and offers must match the profile's Offer section exactly.
