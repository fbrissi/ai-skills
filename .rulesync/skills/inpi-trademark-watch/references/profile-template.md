# INPI trademark watch profile

Copy this template to `docs/ai/inpi-trademark-watch.md` in your repository and fill it in. Keep personal data (CPF, address, payment data) out of it.

```markdown
# INPI trademark watch

## Watched mark
- Mark: <NAME AS FILED>
- Presentation: <nominativa | mista | figurativa | tridimensional>
- Classes (NCL): <42>
- Specification: <items as filed>
- Business: <one line on what the product or service is>

## Own processes
| Process | Class | Filed on | Status |
|---|---|---|---|
| <number> | <42> | <dd/mm/aaaa> | <status> |

## Watch
- Processes: <comma-separated numbers>          # INPI_PROCESSES
- Classes for similar marks: <9,35,42>          # INPI_WATCH_CLASSES; empty = all
- Pattern: <regex>                              # INPI_WATCH_PATTERN; matched against the name uppercased, without accents, spaces or punctuation
- Extra variants to search: <NAME1, NAME2 + WORD, ...>
- High-risk signs: <combinations that should usually be opposed>

## Output
- Language: <pt-BR>
- Action owner: <@handle>
- Decision document: <path to the filing and registration plan, if any>
```
