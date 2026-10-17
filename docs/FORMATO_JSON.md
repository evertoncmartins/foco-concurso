# Formato JSON dos bancos — versão 1

O [guia visual de formato JSON](https://foco-concurso-wine.vercel.app/formato-json.html) explica este formato passo a passo.

Cada arquivo representa um banco, com `schemaVersion`, `id`, `name` e `questions`. `description` é opcional. Use UTF-8, aspas duplas, sem comentários e sem vírgula após o último item.

| Campo | Obrigatório | Regra |
|---|---|---|
| `schemaVersion` | Sim | Número `1` |
| `id` do banco | Sim | 1–120 caracteres; letras, números, `_`, `-` |
| `name` | Sim | Nome legível, não vazio, sem limite de caracteres |
| `description` | Não | Texto sem limite de caracteres; preservado sem cortes |
| `questions` | Sim | Lista de 1 a 5.000 questões |
| `questions[].id` | Sim | ID estável, único no banco; mesmas regras do ID do banco |
| `discipline` | Sim | Disciplina em texto não vazio, sem limite de caracteres |
| `subject` | Sim | Assunto principal temático, como `Educação profissional e tecnológica`; não repetir apenas o nome da lei em todas as questões. O card calcula as quantidades por esse assunto |
| `topic` | Sim | Tópico/subtópico em texto não vazio, sem limite de caracteres |
| `statement` | Sim | Enunciado em texto não vazio, sem limite de caracteres; `\n` quebra linhas |
| `options` | Sim | 2–8 objetos `{ "id": "A", "text": "..." }`; IDs únicos A–H; texto não vazio, sem limite de caracteres; números finitos também são aceitos e convertidos em texto |
| `correctOption` | Sim | ID de uma alternativa existente |
| `explanation` | Sim | Explicação geral didática, em texto não vazio, sem limite de caracteres |
| `optionExplanations` | Pessoal: não; Sistema: sim | Objeto `{ "A": "justificativa", "B": "justificativa" }`, com exatamente as letras existentes em `options`, cada texto não vazio. Não grave um campo de correta/incorreta: a interface usa `correctOption` |
| `fundamentoLegal` | Pessoal: não; Sistema: sim | Lei e dispositivos precisos, como `Lei nº 8.112/1990 — art. 149, caput e § 2º; arts. 156 e 174` |
| `reference` | Não | `{ "label": "...", "url": "https://..." }`; label não vazio, sem limite de caracteres; URL opcional; `null` é permitido |
| `difficulty` | Sim | `easy`, `medium` ou `hard` |
| `tags` | Sim | Lista de até 30 textos, sem limite de caracteres por tag; pode ser `[]` |

Não há limite artificial de caracteres nos conteúdos nem limite de 10 MB nos arquivos JSON, incluindo a importação pelo Google Drive e a restauração/sincronização do progresso. Arquivos UTF-8 com BOM são aceitos. Os limites estruturais acima continuam válidos. A capacidade real depende da memória, da cota de armazenamento do navegador, da conexão e do Google Drive; arquivos muito grandes podem demorar ou exceder esses recursos. Textos obrigatórios continuam precisando ser strings não vazias, com a exceção numérica das alternativas descrita abaixo.

Em alternativas numéricas, `{ "id": "A", "text": 42 }` é aceito e salvo/exportado como `{ "id": "A", "text": "42" }`, sem alterar ID ou gabarito. Prefira texto entre aspas para preservar formatação, zeros iniciais, separadores decimais, unidades, números muito grandes ou notação específica (por exemplo `"03"`, `"3,14"`, `"50%"`). `null`, conteúdo ausente, booleanos, listas e objetos dentro de `text` são recusados com indicação da questão e da letra. O importador não inventa respostas ausentes nem transforma objetos em `[object Object]`.

O identificador interno é `banco:questão`. Use IDs globalmente descritivos para facilitar intercâmbio. Não reutilize o mesmo ID para perguntas diferentes: o histórico permanece associado a ele. Importar um banco com ID existente exige confirmação e atualiza o conteúdo sem apagar respostas.

O [modelo-banco.json](modelo-banco.json) contém um exemplo completo. [questions.schema.json](questions.schema.json) pode ser usado em validadores JSON Schema 2020-12. A aplicação complementa a validação com unicidade dos IDs e vínculo do gabarito às opções. Metadados desconhecidos são descartados na normalização; não use HTML.

## Feedback: um único padrão

Use `explanation` para explicar o conteúdo em geral e `optionExplanations` para analisar cada alternativa separadamente. Cada chave é o ID de uma opção; cada valor deve explicar o motivo concreto e, quando aplicável, citar o dispositivo legal. A avaliação correta/incorreta é calculada de `correctOption`, evitando flags contraditórias no JSON. Em questões que pedem a alternativa **incorreta** ou uma **exceção**, explique que a opção gabaritada atende ao comando, ainda que sua afirmação seja falsa.

`fundamentoLegal` contém número da lei e artigos, parágrafos, incisos ou alíneas pertinentes. `reference.label` identifica a legislação/fonte e `reference.url` fornece o link HTTPS oficial. Não crie campos paralelos como `justificativa`, `explicacao` ou `legalBasis`: os campos oficiais são os documentados aqui. A origem da prova continua nos metadados `instituicao`, `ano`, `tag`, `banca`, `cargo`, `tipo` e `fonte`; a lei consultada fica em `reference`.

Em bancos pessoais, `optionExplanations`, `fundamentoLegal` e `reference` continuam opcionais. Se `optionExplanations` estiver presente, todas as opções devem ter justificativa, sem letras extras. Arquivos anteriores, com análises apenas no texto de `explanation`, continuam aceitos e exibidos; não há conversão ou atualização automática do conteúdo pessoal. HTML é sempre texto, nunca código executado.

Nos bancos nativos de `public/data/question-banks/`, são obrigatórios: explicação geral, justificativa de cada alternativa, fundamento legal, `reference.label`, `reference.url` oficial e `tipo`. Use fonte HTTPS de domínio brasileiro `.gov.br`, `.leg.br` ou `.jus.br`. Informe instituição, ano e origem somente quando comprovados; identifique conteúdo autoral em `tipo`, sem atribuir uma prova fictícia. A ausência de feedback completo impede o build e a publicação do catálogo. No mesmo schema, o perfil padrão aceita bancos pessoais antigos; `#/$defs/nativeBank` acrescenta as exigências editoriais dos nativos. O código também verifica unicidade e correspondência exata das letras, relações que o JSON Schema não compara sozinho.

Na interface, o resultado informa sua escolha e o gabarito; as seções **Explicação**, **Análise das alternativas** e **Fundamentação legal** organizam o conteúdo. O link **Consultar legislação** abre a fonte oficial. Simulados continuam ocultando comentário e gabarito até a conclusão. Melhorias explicativas de uma questão nativa também podem aparecer na consulta de uma sessão antiga quando enunciado, alternativas e gabarito são idênticos; o registro e a nota da época permanecem preservados.

O exemplo completo exibido no guia público é gerado no build diretamente de [modelo-banco.json](modelo-banco.json), o mesmo arquivo oferecido para download. Não mantenha uma segunda cópia do exemplo no HTML.

## Origem de questões de concursos

Os campos abaixo são opcionais e são preservados na importação, no progresso e na sincronização. Não atribua uma origem de concurso a questões autorais. `ano` corresponde ao ano de aplicação da prova, mesmo quando o edital é do ano anterior.

| Campo | Conteúdo |
|---|---|
| `instituicao` | Sigla do órgão ou instituição, por exemplo `INSS` |
| `ano` | Ano da prova, inteiro entre 1900 e 2100 |
| `tag` | Origem visível junto da dificuldade, por exemplo `INSS-2026`; deve corresponder a `instituicao` e `ano` quando ambos estiverem presentes |
| `banca` | Organização responsável comprovada pela fonte; omita se não identificada |
| `cargo` / `nivelCargo` | Cargo e nível de escolaridade/classificação |
| `tipo` | Por exemplo `Questão original`, `Adaptada de prova oficial` ou `Autoral` |
| `fundamentoLegal` | Artigos, parágrafos e incisos |
| `atualizacaoLegislativa` | Nota sobre regra vigente, alterações ou revogações |
| `fonte` | Objeto com as referências abaixo |

Todos os campos textuais de origem são preservados sem limite de caracteres. Em `fonte`, use `prova`, `gabarito`, `editalUrl` e `editalDocumento` para URLs HTTPS sem credenciais; `questaoOriginal`, `paginaProva` e `paginaGabarito` para inteiros de 1 a 10.000 (página do PDF, começando em 1); `edital` e `statusGabarito` para textos não vazios; `dataProva` e `consultaEm` para datas `AAAA-MM-DD`; e `gabaritoOriginal` para a letra A–H do gabarito oficial. `observacao` admite notas sobre a fonte, como gabarito alterado após recurso. A data da consulta não substitui o ano da prova.

A interface apresenta a tag junto da dificuldade, também no modo foco. Questões identificadas como adaptadas recebem o selo **Adaptada**. As referências completas e os links para prova e gabarito aparecem no comentário após responder ou no resultado do simulado. Os campos de origem aceitam qualquer órgão ou instituição. Use `tag` ou o par `instituicao` e `ano` para identificar a prova; tags informais não substituem os metadados de origem.

## Prompt reutilizável

> Gere um banco JSON UTF-8 compatível com Foco, schemaVersion 1, sobre [tema], para preparação do concurso [órgão ou instituição], cargo [cargo], conforme o edital [referência]. Entregue somente JSON válido, sem Markdown. O objeto raiz deve ter id único, name, description e questions. Cada questão deve ter id estável, discipline, subject, topic, statement, options (objetos com id A–E e text), correctOption (ID existente), explanation geral didática, optionExplanations com justificativa específica para cada ID de options, fundamentoLegal com lei e dispositivos, reference (label e URL HTTPS oficial), difficulty (easy/medium/hard) e tags. Crie [quantidade] questões autorais. Confira legislação e bibliografia em fontes oficiais atualizadas. Não invente fontes ou dispositivos legais. Mantenha uma única alternativa correta. Não reutilize IDs de questões diferentes.

## Arquivo de progresso

É diferente do banco. Contém `schemaVersion: 1`, `app: "foco-concursos"`, `events` e, na exportação, `summary` e `performance`. A restauração importa `events`, e os campos agregados são recalculados. Isso evita aceitar percentuais ou contadores inconsistentes. Não edite eventos existentes; importe bancos pela tela Meus bancos.

## Nome de exibição e procedência

Bancos importados pelo usuário são sempre Pessoal, mesmo que o JSON declare `sourceType: system`. O campo opcional `displayName` pode informar um nome de exibição livre; Renomear na plataforma preserva a escolha sem trocar o ID. `bankId` e `sourceType` das questões são atribuídos pela aplicação e não substituem a procedência da prova, instituição, banca ou ano. O espaço `lei-NUMERO` é reservado aos nativos; uma importação pessoal conflitante recebe o prefixo `personal_bank_`, com compatibilidade para o histórico antigo. Veja [BANCOS_SISTEMA.md](BANCOS_SISTEMA.md).

## Publicar um banco do Sistema pelo GitHub

Envie o JSON em `public/data/question-banks/lei-NUMERO.json`. O `id` deve coincidir com o nome do arquivo sem a extensão e `name` deve identificar a mesma lei, por exemplo `Lei nº 9.394/1996`. Use `subtitle` para a descrição curta. Use o perfil de feedback completo descrito acima e no schema em #/$defs/nativeBank. Os demais campos seguem o mesmo formato. Catálogo e revisões são automáticos; não envie `index.json`. Atualizações devem preservar IDs de questões que mantêm o mesmo conteúdo. Veja [BANCOS_SISTEMA.md](BANCOS_SISTEMA.md). A importação pessoal pelo Drive ou pelo aplicativo não exige esse padrão de nome.
