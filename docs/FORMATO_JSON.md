# Formato JSON dos bancos — versão 1

Cada arquivo representa um banco, com `schemaVersion`, `id`, `name` e `questions`. `description` é opcional. Use UTF-8, aspas duplas, sem comentários e sem vírgula após o último item.

| Campo | Obrigatório | Regra |
|---|---|---|
| `schemaVersion` | Sim | Número `1` |
| `id` do banco | Sim | 1–120 caracteres; letras, números, `_`, `-` |
| `name` | Sim | Nome legível, até 200 caracteres |
| `description` | Não | Até 2.000 caracteres |
| `questions` | Sim | Lista de 1 a 5.000 questões |
| `questions[].id` | Sim | ID estável, único no banco; mesmas regras do ID do banco |
| `discipline` | Sim | Disciplina, até 200 caracteres |
| `subject` | Sim | Assunto, até 200 caracteres |
| `topic` | Sim | Tópico/subtópico, até 200 caracteres |
| `statement` | Sim | Enunciado em texto, até 20.000 caracteres; `\n` quebra linhas |
| `options` | Sim | 2–8 objetos `{ "id": "A", "text": "..." }`; IDs únicos A–H |
| `correctOption` | Sim | ID de uma alternativa existente |
| `explanation` | Sim | Comentário didático, até 20.000 caracteres |
| `reference` | Não | `{ "label": "...", "url": "https://..." }`; URL opcional; `null` é permitido |
| `difficulty` | Sim | `easy`, `medium` ou `hard` |
| `tags` | Sim | Lista de textos, até 30 tags de 100 caracteres; pode ser `[]` |

O identificador interno é `banco:questão`. Use IDs globalmente descritivos para facilitar intercâmbio. Não reutilize o mesmo ID para perguntas diferentes: o histórico permanece associado a ele. Importar um banco com ID existente exige confirmação e atualiza o conteúdo sem apagar respostas.

O [modelo-banco.json](modelo-banco.json) contém um exemplo completo. [questions.schema.json](questions.schema.json) pode ser usado em validadores JSON Schema 2020-12. A aplicação complementa a validação com unicidade dos IDs e vínculo do gabarito às opções. Metadados desconhecidos são descartados na normalização; não use HTML.

## Origem de questões de concursos

Os campos abaixo são opcionais e são preservados na importação, no progresso e na sincronização. Não atribua uma origem de concurso a questões autorais. `ano` corresponde ao ano de aplicação da prova, mesmo quando o edital é do ano anterior.

| Campo | Conteúdo |
|---|---|
| `instituicao` | Sigla do órgão ou instituição, por exemplo `INSS` (até 200 caracteres) |
| `ano` | Ano da prova, inteiro entre 1900 e 2100 |
| `tag` | Origem visível junto da dificuldade, por exemplo `INSS-2026` (até 100 caracteres); deve corresponder a `instituicao` e `ano` quando ambos estiverem presentes |
| `banca` | Organização responsável comprovada pela fonte (até 200 caracteres); omita se não identificada |
| `cargo` / `nivelCargo` | Cargo (até 300 caracteres) e nível de escolaridade/classificação (até 200 caracteres) |
| `tipo` | Por exemplo `Questão original`, `Adaptada de prova oficial` ou `Autoral` (até 200 caracteres) |
| `fundamentoLegal` | Artigos, parágrafos e incisos (até 2.000 caracteres) |
| `atualizacaoLegislativa` | Nota sobre regra vigente, alterações ou revogações (até 2.000 caracteres) |
| `fonte` | Objeto com as referências abaixo |

Em `fonte`, use `prova`, `gabarito`, `editalUrl` e `editalDocumento` para URLs HTTPS sem credenciais (até 3.000 caracteres); `questaoOriginal`, `paginaProva` e `paginaGabarito` para inteiros de 1 a 10.000 (página do PDF, começando em 1); `edital` e `statusGabarito` para textos de até 200 caracteres; `dataProva` e `consultaEm` para datas `AAAA-MM-DD`; e `gabaritoOriginal` para a letra A–H do gabarito oficial. `observacao` admite notas de até 1.000 caracteres sobre a fonte, como gabarito alterado após recurso. A data da consulta não substitui o ano da prova.

A interface apresenta a tag junto da dificuldade, também no modo foco. Questões identificadas como adaptadas recebem o selo **Adaptada**. As referências completas e os links para prova e gabarito aparecem no comentário após responder ou no resultado do simulado. Os campos de origem aceitam qualquer órgão ou instituição. Use `tag` ou o par `instituicao` e `ano` para identificar a prova; tags informais não substituem os metadados de origem.

## Prompt reutilizável

> Gere um banco JSON UTF-8 compatível com Foco, schemaVersion 1, sobre [tema], para preparação do concurso [órgão ou instituição], cargo [cargo], conforme o edital [referência]. Entregue somente JSON válido, sem Markdown. O objeto raiz deve ter id único, name, description e questions. Cada questão deve ter id estável, discipline, subject, topic, statement, options (objetos com id A–E e text), correctOption (ID existente), explanation didática, reference (label e URL HTTPS oficial quando disponível), difficulty (easy/medium/hard) e tags. Crie [quantidade] questões autorais. Confira legislação e bibliografia em fontes oficiais atualizadas. Não invente fontes ou dispositivos legais. Mantenha uma única alternativa correta. Não reutilize IDs de questões diferentes.

## Arquivo de progresso

É diferente do banco. Contém `schemaVersion: 1`, `app: "foco-concursos"`, `events` e, na exportação, `summary` e `performance`. A restauração importa `events`, e os campos agregados são recalculados. Isso evita aceitar percentuais ou contadores inconsistentes. Não edite eventos existentes; importe bancos pela tela Meus bancos.
