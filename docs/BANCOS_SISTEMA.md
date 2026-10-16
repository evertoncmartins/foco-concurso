# Bancos do sistema pelo GitHub — 1.18.0

## Pasta para enviar os arquivos

[public/data/question-banks/](https://github.com/evertoncmartins/foco-concurso/tree/main/public/data/question-banks)

Essa pasta é a fonte dos bancos do Sistema. Para disponibilizar um banco a todos, envie seu JSON diretamente nessa pasta, na branch `main`, pelo botão **Add file → Upload files**, e confirme o commit. A integração GitHub/Vercel executa a validação e publica a atualização automaticamente. Aguarde a implantação terminar; a simples seleção do arquivo na tela de upload não publica o banco.

Não é necessário editar um catálogo, cadastrar o arquivo no código ou configurar armazenamento. O build descobre todos os arquivos de banco e gera `dist/data/question-banks/index.json`. Esse índice é um resultado da publicação e não deve ser enviado ou mantido manualmente. Um `index.json` antigo na pasta de origem é ignorado.

## Padrão obrigatório

| Arquivo | `id` dentro do JSON | `name` dentro do JSON | Subtítulo |
| --- | --- | --- | --- |
| `lei-8112.json` | `lei-8112` | `Lei nº 8.112/1990` | Servidores públicos federais |
| `lei-8069.json` | `lei-8069` | `Lei nº 8.069/1990` | Estatuto da Criança e do Adolescente |
| `lei-9394.json` | `lei-9394` | `Lei nº 9.394/1996` | Lei de Diretrizes e Bases da Educação Nacional |

Use letras minúsculas, sem pontos ou ano no nome do arquivo e no ID. O ano aparece no título. Um arquivo representa uma lei; para juntar mais questões da mesma lei, atualize seu arquivo existente. O campo opcional `subtitle` guarda o nome descritivo. O sistema padroniza o título da lei; `displayName` não substitui esse título em bancos do Sistema.

O JSON deve seguir o [formato nativo do importador](FORMATO_JSON.md): objeto com `schemaVersion: 1`, `id`, `name`, `description` e `questions`. Cada questão precisa de ID único, disciplina, assunto, tópico, enunciado, alternativas textuais com IDs A–H, gabarito existente, comentário, dificuldade e tags. Fontes e metadados de origem continuam suportados. JSON em UTF-8 com ou sem BOM é aceito. Arquivos devem ficar diretamente nessa pasta, sem subpastas.

O build recusa nomes de arquivo incorretos, ID divergente, título de outra lei, JSON inválido, questões repetidas e gabaritos inexistentes, indicando o arquivo e o problema. Uma validação que falha impede a implantação; a versão anterior permanece publicada.

## Atualizar e retirar bancos

Para atualizar, substitua o JSON mantendo o nome do arquivo, o ID do banco e os IDs das questões que continuam sendo as mesmas. Conteúdos diferentes devem receber IDs novos. Não é necessário editar `revision`, `publishedAt` ou a versão do catálogo: as revisões são calculadas automaticamente pelo conteúdo. Alterar o conteúdo muda sua revisão; reformatar o JSON não cria uma revisão diferente.

Para retirar um banco de novas sessões, remova o respectivo arquivo pelo GitHub e confirme o commit. As sessões e respostas já salvas conservam as versões históricas utilizadas. O gabarito de um resultado anterior não é recalculado com um arquivo novo.

Quem já estiver com o Foco aberto pode usar **Banco de questões → Atualizar catálogo** depois da implantação. O espelho Sites consulta o catálogo e os arquivos públicos da produção, inclusive bancos adicionados posteriormente pelo GitHub. Se a produção estiver indisponível, conserva o fallback dos bancos incluídos na sua própria publicação.

## Sistema e Pessoal

Os bancos do Sistema são públicos e carregam sem login ou Drive. Usuários podem estudar, exportar e ativar/desativar esses bancos em seu perfil. A interface não oferece renomeação, exclusão global ou upload administrativo de bancos do Sistema. O acesso de escrita ao repositório determina quem pode publicá-los. A API `/api/question-banks` é somente leitura, inclusive para a conta administradora, e não consulta Google UserInfo nem armazenamento externo.

Os bancos enviados pelo importador do Foco ou pela pasta do Drive continuam **Pessoais**, mesmo que declarem `sourceType: system`. Podem ser renomeados e removidos pelo próprio usuário. Bancos pessoais, preferências, sessões e respostas continuam no arquivo principal de progresso da conta; não são enviados ao GitHub. Sessões podem combinar as duas origens, identificadas pelas tags Sistema/Pessoal.

IDs pessoais antigos reservados (`lei-NUMERO`) continuam traduzidos de forma determinística no modelo, sem reescrever o diário ou perder progresso. Não ocorre transferência automática do progresso de um banco pessoal para um banco do Sistema. Os snapshots já gravados na 1.17.0 continuam aceitos. No modo visitante, o progresso continua temporário.

## Verificação

Os testes cobrem descoberta de arquivos adicionados e removidos sem índice, validação antes de substituir o build, revisão automática, consistência entre catálogo e arquivos publicados, API somente leitura, carregamento remoto pelo espelho, fallback, sessões mistas, renomeação pessoal e resultados históricos após atualização. Login Google e Drive mantêm sua infraestrutura anterior; esta mudança não exige Blob nem novas variáveis da Vercel.
