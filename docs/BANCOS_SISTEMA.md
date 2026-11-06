# Bancos do sistema pelo GitHub — 1.18.0

## Pasta para enviar os arquivos

[public/data/question-banks/](https://github.com/evertoncmartins/foco-concurso/tree/main/public/data/question-banks)

Essa pasta é a fonte dos bancos do Sistema. Para disponibilizar um banco a todos, envie seu JSON diretamente nessa pasta, na branch `main`, pelo botão **Add file → Upload files**, e confirme o commit. A integração GitHub/Vercel executa a validação e publica a atualização automaticamente. Aguarde a implantação terminar; a simples seleção do arquivo na tela de upload não publica o banco.

Desde a 1.23.0, a conta administrativa confirmada `ecmdigital@gmail.com` também pode usar **Banco de questões → Enviar JSON do Sistema**. O seletor aceita um JSON por envio, até 3 MB, valida o perfil nativo e confirma o alcance público. O servidor cria o arquivo na mesma pasta da `main`, sem sobrescrever uma lei existente. Depois da publicação, use **Sincronizar**. **Importar JSON pessoal** e arrastar arquivos continuam criando bancos somente na conta atual, inclusive para o administrador.

Não é necessário editar um catálogo, cadastrar o arquivo no código ou configurar armazenamento. O build descobre todos os arquivos de banco e gera `dist/data/question-banks/index.json`. Esse índice é um resultado da publicação e não deve ser enviado ou mantido manualmente. Um `index.json` antigo na pasta de origem é ignorado.

Ao abrir **Banco de questões**, o Foco consulta novamente os arquivos publicados. Desde a 1.24.0, remoções são aplicadas automaticamente nessa consulta. Questões novas e alteradas continuam sinalizadas: **Sincronizar banco** aplica a atualização daquela lei; **Sincronizar**, no topo, aplica o catálogo inteiro. Bancos novos também aguardam essa confirmação. O botão de sincronização do Drive consulta as atualizações do sistema e avisa quando houver pendências no Banco de questões.

Bancos removidos sem respostas ou sessões consultáveis da conta atual saem da página. Para quem tem estudos daquela lei na etapa atual, o card permanece como **Indisponível**, ao final, com aparência discreta e acesso às sessões e aos detalhes históricos, sem habilitar novos estudos. Bancos desativados também recebem menor destaque. A sincronização não altera respostas, notas, sessões, bancos pessoais ou preferências. Se a consulta falhar, o último catálogo carregado e os avisos já confirmados são mantidos.

A exclusão administrativa confirmada retira o card imediatamente na página aberta, preservando apenas o histórico consultável. Uma proteção em memória impede que o JSON da publicação anterior recrie a mesma revisão enquanto a implantação termina. Isso não grava nem apaga progresso. Uma republicação posterior continua sendo descoberta normalmente. A exclusão global de bancos atribuídos permanece bloqueada no servidor.

Os botões **Cards** e **Lista** alternam a apresentação dos mesmos bancos, resumos, detalhes e ações. A preferência é salva na configuração local da conta, sem alterar o catálogo ou o diário de estudos. A lista se adapta ao Desktop e ao Mobile.

No desenvolvimento com `npm run dev`, os bancos são lidos diretamente de `public/data/question-banks/` a cada consulta, sem refazer o build para adicionar, atualizar ou remover uma lei. No endereço publicado, é necessário enviar a mudança à branch `main` do GitHub, diretamente ou pelo envio administrativo, e aguardar a publicação terminar. O botão **Sincronizar** consulta os arquivos publicados.

## Padrão obrigatório

| Arquivo | `id` dentro do JSON | `name` dentro do JSON | Subtítulo |
| --- | --- | --- | --- |
| `lei-8112.json` | `lei-8112` | `Lei nº 8.112/1990` | Servidores públicos federais |
| `lei-8069.json` | `lei-8069` | `Lei nº 8.069/1990` | Estatuto da Criança e do Adolescente |
| `lei-9394.json` | `lei-9394` | `Lei nº 9.394/1996` | Lei de Diretrizes e Bases da Educação Nacional |
| `lei-12772.json` | `lei-12772` | `Lei nº 12.772/2012` | Carreiras e cargos do Magistério Federal |

Use letras minúsculas, sem pontos ou ano no nome do arquivo e no ID. O ano aparece no título. Um arquivo representa uma lei; para juntar mais questões da mesma lei, atualize seu arquivo existente. O campo opcional `subtitle` guarda o nome descritivo. O sistema padroniza o título da lei; `displayName` não substitui esse título em bancos do Sistema.

O JSON deve seguir o [formato nativo do importador](FORMATO_JSON.md): objeto com `schemaVersion: 1`, `id`, `name`, `description` e `questions`. Cada questão precisa de ID único, disciplina, assunto, tópico, enunciado, alternativas textuais com IDs A–H, gabarito existente, comentário, dificuldade e tags. Fontes e metadados de origem continuam suportados. JSON em UTF-8 com ou sem BOM é aceito. Arquivos devem ficar diretamente nessa pasta, sem subpastas.

O build recusa nomes de arquivo incorretos, ID divergente, título de outra lei, JSON inválido, questões repetidas e gabaritos inexistentes, indicando o arquivo e o problema. Uma validação que falha impede a implantação; a versão anterior permanece publicada.

## Apresentação dos próximos bancos

Use o card da Lei nº 8.112/1990 como referência: título e subtítulo, resumo de questões/instituições/período, descrição breve, link oficial, assuntos com quantidades e instituições de origem. `description` deve resumir conteúdo e recorte; registre observações sobre pesquisa e situação do gabarito em `fonte` de cada questão.

Em `subject`, informe um assunto principal temático, como `Educação profissional e tecnológica`; em `topic`, detalhe o conteúdo, como `Formação técnica integrada`. Não repita apenas o nome da lei no assunto de todas as questões. O card calcula as quantidades pelos registros reais e conta cada questão uma vez; a soma dos assuntos deve corresponder ao total. Não mantenha contagens ou listas de assuntos manualmente na descrição. Confira também o reconhecimento da lei e o link de consulta na apresentação compartilhada.

## Atualizar e retirar bancos

Para atualizar, substitua o JSON mantendo o nome do arquivo, o ID do banco e os IDs das questões que continuam sendo as mesmas. Conteúdos diferentes devem receber IDs novos. Não é necessário editar `revision`, `publishedAt` ou a versão do catálogo: as revisões são calculadas automaticamente pelo conteúdo. Alterar o conteúdo muda sua revisão; reformatar o JSON não cria uma revisão diferente.

Para retirar um banco de novas sessões, remova o respectivo arquivo pelo GitHub e confirme o commit. As sessões e respostas já salvas conservam as versões históricas utilizadas. O gabarito de um resultado anterior não é recalculado com um arquivo novo.

Quem já estiver com o Foco aberto pode usar **Banco de questões → Atualizar catálogo** depois da implantação. O espelho Sites consulta o catálogo e os arquivos públicos da produção, inclusive bancos adicionados posteriormente pelo GitHub. Se a produção estiver indisponível, conserva o fallback dos bancos incluídos na sua própria publicação.

## Sistema e Pessoal

Os bancos do Sistema são públicos e carregam sem login ou Drive. Usuários podem estudar e exportar esses bancos. Enviar, ativar/desativar para todos e excluir são ações exclusivas da administração, verificadas no servidor. O conteúdo continua versionado pelo GitHub. A API `/api/question-banks` permanece somente leitura, sem Google UserInfo ou armazenamento externo; as operações administrativas usam `/api/bank-management`.

Os bancos enviados pelo importador do Foco ou pela pasta do Drive continuam **Pessoais**, mesmo que declarem `sourceType: system`. Podem ser renomeados e removidos pelo próprio usuário. Bancos pessoais, preferências, sessões e respostas continuam no arquivo principal de progresso da conta; não são enviados ao GitHub. Sessões podem combinar as duas origens, identificadas pelas tags Sistema/Pessoal.

IDs pessoais antigos reservados (`lei-NUMERO`) continuam traduzidos de forma determinística no modelo, sem reescrever o diário ou perder progresso. Não ocorre transferência automática do progresso de um banco pessoal para um banco do Sistema. Os snapshots já gravados na 1.17.0 continuam aceitos. No modo visitante, o progresso continua temporário.

## Associar progresso pessoal ao Sistema — 1.19.0

Quando todas as questões de um banco pessoal têm correspondência exata e sem ambiguidade em um único banco nativo, o card pessoal em **Banco de questões** oferece **Associar progresso**. A comparação considera enunciado, IDs e textos das alternativas e gabarito; não usa nome do arquivo ou título da lei para concluir equivalência. IDs de questões diferentes só são relacionados quando o conteúdo tem uma correspondência única. Melhorias de explicação e metadados não impedem a comparação.

A confirmação associa o progresso da conta ao banco nativo e desativa o banco pessoal para novos estudos. Não reescreve nem copia tentativas: respostas, datas, acertos/erros, favoritos, revisões e sessões originais são preservados, com a origem Pessoal nos registros anteriores. Novas respostas no Sistema e respostas equivalentes de dispositivos antigos entram na mesma sequência de revisão, sem duplicar o histórico. Sessões antigas podem ser retomadas mesmo depois de remover o banco pessoal da lista; os resultados preservam seus gabaritos registrados. A associação pode ser desfeita nos detalhes do card.

A prova da associação referencia a versão importada e um snapshot da versão nativa. O evento é salvo no arquivo principal de progresso, pela sincronização normal. Confirme **Drive sincronizado** antes de remover os JSONs separados das leis. Apagar esses JSONs do Drive não remove um banco já incorporado ao arquivo principal. Para deixar de exibi-lo na lista, use a exclusão do banco pessoal no Foco depois de associar. **Não apague o arquivo `foco-progresso-…-principal.json`**: ele contém o histórico, as questões pessoais e as associações. A funcionalidade não exclui arquivos do Drive e não associa contas diferentes.

## Verificação

Os testes cobrem descoberta de arquivos adicionados e removidos sem índice, validação antes de substituir o build, revisão automática, consistência entre catálogo e arquivos publicados, API pública somente leitura, carregamento remoto pelo espelho, fallback, avisos e aplicação de atualização por banco, sessões mistas, renomeação pessoal e resultados históricos após atualização. Login Google e Drive mantêm sua infraestrutura anterior. Os avisos de sincronização não exigem novas variáveis; a exclusão global opcional exige a configuração abaixo.

## Exclusão global e atribuições — 1.22.0

**Ativação solicitada pelo usuário em 05/11/2026.** O registro central utiliza o recurso Upstash `foco-bank-assignments`, conectado exclusivamente à produção do projeto `foco-concurso`, no plano gratuito, com `eviction=false` e `autoUpgrade=false`. A conta administradora e os IDs protegidos ficam nas variáveis de produção; o segredo de atribuições nunca é versionado. A exclusão global permanece bloqueada enquanto faltar qualquer pré-requisito abaixo. Desde a 1.23.0, desativar um banco do Sistema é uma ação administrativa global. Bancos pessoais mantêm seus controles individuais e a exclusão anterior, preservando o histórico.

A primeira sessão autenticada em uma lei registra sua atribuição antes de salvar a sessão. Essa atribuição é permanente: desativar, excluir sessões ou zerar progresso não autoriza a exclusão global. Visitantes não representam contas atribuídas. O registro central guarda somente um pseudônimo HMAC do identificador Google por lei, sem nome, e-mail, respostas, questões ou progresso; não vai para o GitHub. A API exige token Google válido para este cliente OAuth e verifica a conta e o e-mail confirmado no servidor.

Nos detalhes do card, apenas contas em `BANK_ADMIN_EMAILS` recebem **Excluir** para o Sistema. O servidor confere novamente as atribuições, mesmo que o botão tenha sido habilitado antes de outra pessoa iniciar um estudo. A reserva de exclusão e a atribuição usam operações Lua atômicas no mesmo Redis. Após a reserva, novas sessões naquela lei são recusadas. A exclusão remove apenas `public/data/question-banks/lei-NUMERO.json` no GitHub, na `main`, com o SHA vigente e a revisão conferida. A publicação normal da Vercel retira o card após sincronizar; respostas e snapshots existentes não são apagados.

Desde a 1.22.2, arquivos acima de 1 MB também podem ser conferidos: quando a API de conteúdo do GitHub omite os dados, a leitura usa o Git blob identificado pelo SHA recebido. O hash do conteúdo e a revisão são validados antes da reserva. Exemplos necessários aos testes ficam em `tests/fixtures/`, para que retirar a Lei nº 11.892/2008 do catálogo não impeça a publicação.

Não é possível provar ausência de estudos anteriores ao registro central, inclusive em dispositivos offline. Por isso os cinco bancos já publicados ficam protegidos por padrão em `LEGACY_SYSTEM_BANK_IDS`. Ao ativar, proteja também **todos os bancos publicados durante o período em que o controle ficou desligado**; não interprete ausência de registro como ausência de usuários. Dispositivos com versões antigas precisam carregar a versão com o controle antes de usar bancos novos.

Uma confirmação expressa do proprietário de que **ninguém iniciou sessões em determinada lei**, conferida também contra o registro central, permite revisar somente a proteção anterior dessa lei por `BANK_REVIEWED_UNUSED_IDS`. Essa exceção não remove IDs do baseline, não apaga atribuições e não ignora a reserva atômica: qualquer usuário registrado ou exclusão em andamento continua bloqueando a remoção. Em 05/11/2026 o proprietário confirmou a ausência de estudos anteriores na Lei nº 11.892/2008; a revisão autorizada abrange somente `lei-11892`. As outras quatro leis mantêm a proteção anterior. Novas sessões autenticadas passam a registrar atribuições também nos bancos antigos, antes de salvar a sessão.

### Configuração da ativação

1. Aceite os termos do Upstash e conecte um Redis pelo Marketplace da Vercel, preferencialmente no plano gratuito, com `eviction=false` e `autoUpgrade=false`. Use uma base durável exclusiva; não apague registros de atribuição ou restaure backups que os omitam.
2. Configure na Vercel, somente no servidor: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (ou as equivalentes `KV_REST_API_URL` e `KV_REST_API_TOKEN`) e `BANK_ASSIGNMENT_SECRET`, um segredo aleatório estável com pelo menos 32 caracteres. Não rotacione esse segredo sem migrar os pseudônimos.
3. Antes de ativar, confira todas as leis já publicadas e preencha `BANK_PROTECTED_IDS` com seus IDs separados por vírgula. Capture os IDs com `node --input-type=module -e "import {repositoryCatalog} from './server/repository-banks.mjs'; console.log(repositoryCatalog().banks.map(b=>b.id).join(','))"`. Nunca retire IDs dessa lista para liberar uma lei já utilizada.
4. Preencha `BANK_ADMIN_EMAILS` com os e-mails administrativos separados por vírgula. Adicione `BANK_GITHUB_TOKEN` como segredo: token fino limitado a `evertoncmartins/foco-concurso`, com **Contents: Read and write**, sem acesso a outros repositórios. Não envie o token pelo chat, em arquivos versionados ou ao frontend.
   Quando houver uma revisão expressa de ausência de estudos anteriores, acrescente somente os IDs autorizados a `BANK_REVIEWED_UNUSED_IDS`. Não use essa variável para contornar uma atribuição existente; o servidor continuará recusando a exclusão desses bancos.
5. Publique novamente e confira o controle com uma lei nova ainda não estudada. O preview local não escreve atribuições nem habilita exclusões globais. Se o registro ativo ficar indisponível, bancos novos não iniciam sessões sem verificação; os bancos protegidos e o histórico continuam disponíveis.

Quando a resposta do GitHub é inconclusiva (por exemplo, timeout após o envio), a reserva **não expira automaticamente**. O banco fica bloqueado. Um operador deve conferir o commit e a existência do arquivo na `main` antes de reconciliar a chave `foco:bank-attribution:v1:lei-NUMERO:state`. Se o arquivo foi removido, mantenha `deleted`. Só libere uma reserva pendente após confirmar que a requisição terminou sem exclusão. Nunca apague a chave `:users`. Reintroduzir o mesmo ID não limpa atribuições nem autoriza reutilizá-lo para outra lei.

### Disponibilidade global e republicação — 1.23.0

**Ativar banco para todos** e **Desativar banco para todos** aparecem apenas à administração. A alteração grava `active` no JSON oficial com o SHA e a revisão conferidos. Ausência de `active` equivale a `true`; `false` mantém o banco visível, mas fora de novas filas. Preferências pessoais antigas de ativação do Sistema permanecem no diário como compatibilidade, sem sobrepor a disponibilidade global. A desativação de bancos pessoais continua isolada por conta.

O registro central usa `:disabled` para impedir novas sessões autenticadas imediatamente após confirmar a alteração, inclusive em uma página com catálogo anterior. Cada nova sessão verifica a disponibilidade, mesmo quando a conta já tem atribuição. Sessões em andamento podem ser retomadas e resultados anteriores continuam consultáveis. Visitantes e dispositivos desconectados só recebem a disponibilidade atual quando conseguem consultar o catálogo publicado.

Envios e alterações reservam `:state` atomicamente, sem apagar `:users`. Um ID ausente no GitHub pode ser republicado para a mesma lei após uma exclusão confirmada: o estado `deleted` só é liberado depois de criar e confirmar o novo arquivo, preservando todas as atribuições. Um arquivo existente ou uma operação em andamento bloqueia o envio. Falhas conclusivas restauram o estado anterior; um resultado ambíguo mantém a reserva até conferência operacional. Para reconciliar uma publicação confirmada, confira também `active` e ajuste `:disabled` antes de liberar a reserva.

## Feedback completo obrigatório — 1.20.0

Todos os bancos dessa pasta seguem os mesmos campos de [FORMATO_JSON.md](FORMATO_JSON.md) e do [schema único](questions.schema.json), perfil `#/$defs/nativeBank`: `explanation` geral, `optionExplanations` com uma justificativa específica por alternativa, `fundamentoLegal`, `reference` com nome e URL oficial, e `tipo`. A justificativa deve explicar a opção e seu dispositivo, incluindo o sentido do comando em questões de exceção. Não use campos alternativos para o mesmo conteúdo. Origem, ano e banca só devem ser informados quando comprovados.

O catálogo verifica esse perfil antes de publicar ou substituir o build anterior. A importação pessoal continua aceitando o formato anterior, sem novos campos obrigatórios. Melhorias de feedback preservam IDs, gabaritos, alternativas e progresso. Sessões históricas de questões nativas idênticas recebem apenas a apresentação explicativa atual; sua nota e seus eventos não são regravados. O modelo para download e o exemplo do guia público usam a mesma fonte JSON no build.
