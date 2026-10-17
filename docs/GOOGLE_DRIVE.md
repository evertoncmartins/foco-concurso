# Google Drive — configuração e funcionamento

## Configurar uma vez

O responsável pela plataforma configura um cliente OAuth público único. Leia [LOGIN_GOOGLE.md](LOGIN_GOOGLE.md). Os estudantes apenas entram com Google e escolhem sua pasta do Meu Drive. Não precisam criar projetos no Google Cloud.

Cada usuário informa o ID ou link da pasta durante a primeira entrada, ou em Ajustes. Após conectar, o ID fica salvo na área privada `appDataFolder` da própria conta Google e é recuperado em outros dispositivos. A conta conectada precisa ter permissão para adicionar arquivos. As pastas não são alteradas pelo sistema e os arquivos herdam suas permissões; use uma pasta privada para histórico pessoal.

## Recuperação automática da pasta (1.2.0)

O login solicita perfil e `https://www.googleapis.com/auth/drive.appdata`. A configuração pertence ao usuário conectado, não ao proprietário do projeto Google Cloud. Ela não aparece nos arquivos comuns do Meu Drive. O escopo deve ser declarado em **Google Auth Platform → Acesso a dados** pelo responsável.

O app lê os snapshots `foco-configuracao.json` em `spaces=appDataFolder` antes de decidir qual pasta conectar. Cada snapshot contém somente versão do schema, identificação do aplicativo/conta, revisão lógica, ID da alteração e ID da pasta. Não contém token, senha, questões ou respostas. Exemplo:

```json
{
  "schemaVersion": 1,
  "app": "foco-concursos",
  "kind": "folder-settings",
  "owner": {"provider": "google", "subject": "ID_ESTAVEL_DA_CONTA"},
  "revision": 1,
  "changeId": "UUID_DA_ALTERACAO",
  "folderId": "ID_DA_PASTA_ESCOLHIDA"
}
```

A pasta remota prevalece sobre uma configuração local antiga. Quando não existe configuração remota, a pasta local é migrada somente depois da validação de acesso. Uma falha de leitura não é interpretada como ausência de configuração.

As escolhas de pasta são snapshots imutáveis. A maior revisão lógica prevalece; mudanças simultâneas na mesma revisão usam a data do Drive e o ID do arquivo como desempate determinístico. Não é usado o relógio do dispositivo para decidir a revisão. Os snapshots anteriores continuam preservados; não há exclusão nem sobrescrita.

Uploads pendentes ficam no armazenamento local da conta com um ID pré-gerado para `appDataFolder`; repetir após falha não cria outra configuração. Se outra pessoa/dispositivo da mesma conta mudou a pasta enquanto um envio estava pendente, o envio antigo é bloqueado. Salvar novamente em Ajustes confirma uma nova escolha explícita. Não confunda essa configuração com o diário de progresso: o progresso e os bancos permanecem na pasta escolhida.

Se a autorização retornada no login incluir o acesso Drive já concedido, a recuperação do progresso acontece automaticamente. Se o Google solicitar nova permissão, o app recupera a pasta e oferece **Autorizar minha pasta**. Tokens de acesso ficam em memória; na produção, a renovação usa um cookie cifrado HttpOnly descrito em LOGIN_GOOGLE.md. Se o usuário apagar os dados do aplicativo nas configurações do Drive, precisará informar a pasta novamente; os arquivos de progresso da pasta escolhida não são removidos pelo app.

## Durante o estudo

### Sessões e simulados salvos

Em **Minhas sessões**, as abas **Em andamento** e **Concluídas** permitem retomar uma sessão específica ou consultar seu resultado. Iniciar um estudo de outra lei não encerra nem substitui as sessões anteriores. Filtros por banco/lei e por Estudo/Simulado, com paginação, dão acesso ao histórico completo da etapa atual de progresso. Uma sessão com vários bancos aparece no filtro de cada banco incluído.

Fila, posição e respostas registradas são eventos do mesmo diário pessoal, sincronizados no arquivo principal; não é criado um arquivo de progresso por lei ou por simulado. A sincronização mantém as regras de união, controle de versão e isolamento por conta. Seleções ainda não registradas não sobrevivem à recarga; respostas registradas sobrevivem. No visitante, o histórico continua somente em memória.

Consultar um resultado concluído não gera tentativas, não modifica a nota nem substitui a sessão que estava ativa. O resultado conserva o gabarito registrado e recupera o conteúdo das versões de bancos já presentes no diário. Se faltar conteúdo, a nota mantém o total original de questões e a interface avisa da indisponibilidade. Retomar uma sessão depende de suas questões estarem importadas com os mesmos IDs. Simulados em andamento não revelam acertos, erros ou gabarito.

O filtro de banco/lei em **Desempenho** muda apenas a consulta de estatísticas. **Zerar progresso** continua abrangendo todos os bancos e remove sessões e simulados da etapa ativa, após confirmação.

### Zerar progresso pessoal

No final de Desempenho, **Zerar progresso** pede confirmação e inicia uma nova etapa de estudo. Respostas, estatísticas, favoritos, revisões e sessões voltam a zero; nome, conta, foto, preferências, pasta e bancos importados não são removidos. Cancelar não altera nenhum registro.

O evento `progress-reset` identifica o reinício no diário da própria conta; novos registros usam seu identificador em `progressEpoch`. Eventos anteriores permanecem no diário técnico para reconciliar dispositivos e backups, mas deixam de compor qualquer progresso ou estatística. É um reinício lógico de estudos, não uma exclusão física dos arquivos pessoais.

O marcador sincroniza com o mesmo arquivo principal do Drive. Backups antigos não reativam a etapa anterior e sessões antigas são descartadas. Se o envio falhar, o reinício permanece salvo localmente, com aviso de sincronização pendente. Outros dispositivos devem usar a versão atualizada do Foco para ler o novo tipo de evento.

Após confirmar o reinício, uma tela animada informa o salvamento local, a conferência dos arquivos e o envio ao Drive. O percentual representa etapas, sem estimar tempo ou bytes: só chega a 100% após a confirmação da sincronização. A tela bloqueia os controles durante essa operação e desaparece automaticamente ao terminar. Em caso de falha, também é fechada e o aviso informa que o envio está pendente. Sincronizações comuns mantêm o comportamento habitual.

Após conectar, o sistema localiza o arquivo `foco-progresso-<sub>-principal.json`, confirma a propriedade da conta e do conteúdo, valida os eventos e une os históricos remoto e local. Em seguida atualiza esse mesmo arquivo quando há alterações locais. Se não houver histórico, cria o principal automaticamente. A versão do arquivo fica em cache: se o conteúdo remoto não mudou e os eventos estão disponíveis localmente, o app evita baixar o JSON novamente.

Cada mudança é salva localmente imediatamente. Com autorização ativa, o envio ao Drive ocorre após 6 segundos de inatividade; concluir uma sessão também dispara uma sincronização. O botão Sincronizar permite executar o processo manualmente. Ao voltar ao site ou recuperar a rede, a sincronização é tentada enquanto o token continua válido.

Após recarregar/abrir o site, é necessário entrar com Google novamente. Durante os estudos na produção Vercel, o token temporário é renovado automaticamente pelo backend antes de expirar; uma resposta 401 permite uma única renovação e repetição da requisição. Não há popup nem redirecionamento nessa renovação, e o progresso local e a questão atual são preservados. A credencial de renovação usa cookie cifrado HttpOnly/Secure por até 30 dias, renovado ao uso; não vai para o Drive nem para localStorage. Em hospedagem estática ou quando o Google exige nova permissão, o site mostra “Reconectar Drive”; os dados locais continuam salvos. Não existe envio em segundo plano com o navegador fechado.

## Arquivo único e migração (1.7.0)

O principal contém o histórico completo de eventos, deduplicados por UUID. Na primeira conexão após a atualização, os lotes `foco-progresso-<sub>-*.json` das versões anteriores são lidos, validados e reunidos com o progresso local. Um dos arquivos existentes é atualizado e renomeado para principal, preservando seu ID. O app baixa e confere o conteúdo gravado antes de mover os demais arquivos incorporados para a lixeira. A limpeza é reversível e não esvazia a lixeira, nem afeta bancos JSON ou dados de outras contas. Uma migração interrompida pode ser retomada ao sincronizar novamente.

## Evitar perdas e sobrescritas

As gravações usam o ETag do recurso de arquivo da API Drive v2 em `If-Match`. Se outro dispositivo modifica o arquivo depois da leitura, o Drive recusa a gravação com 412. O Foco relê a versão atual, une os históricos e tenta novamente, com limite de seis tentativas por sincronização. A limpeza dos lotes também usa sua versão exata: um lote alterado precisa ser incorporado novamente antes de ir para a lixeira. A API v3 permanece responsável por listagem, criação e download. Não há novo banco de dados, escopo OAuth ou segredo de servidor.

Bancos, respostas, marcações e sessões continuam como eventos. Um evento idêntico já existente não aumenta tentativas novamente. Mesmo ID com conteúdos válidos diferentes é reconciliado automaticamente conforme a política abaixo. Sessões independentes se unem normalmente. Alterações locais recebidas durante um envio são incluídas na próxima atualização do principal.

Desde a versão 1.19.1, diário e cache locais usam IndexedDB por conta, com gravação atômica e revisão para concorrência entre abas. A migração do `localStorage` verifica a cópia persistida antes de remover os registros anteriores e recupera eventos em envios pendentes. Se a gravação ou a conferência falhar, os dados anteriores são mantidos. Nenhuma autorização Google adicional é necessária.

O cache local guarda IDs de eventos/arquivos confirmados, ETags, uma assinatura SHA-256 do conteúdo e, durante a primeira criação, um envio pendente com ID estável. A assinatura impede que uma versão local reconciliada seja confundida com o conteúdo remoto só por ter o mesmo ID. Nunca guarda tokens. Falhas de leitura não são interpretadas como histórico vazio. Criações simultâneas em uma pasta vazia podem gerar dois principais temporariamente; a sincronização os reúne e mantém um único arquivo ativo. Clientes antigos ainda abertos podem gerar lotes, que a nova versão incorpora na próxima sincronização. Atualize todas as abas e dispositivos para utilizar o fluxo novo.

## Reconciliação automática — 1.10.2

A restauração do Drive e a importação de backups da mesma conta usam a mesma reconciliação. A ordem das propriedades JSON é ignorada; a ordem dos itens das listas continua significativa. Dados são validados e normalizados antes da comparação.

Quando existem versões diferentes de um evento válido com o mesmo ID, a resposta de uma tentativa conserva a primeira versão registrada. Bancos, estados, marcações e sessões conservam a versão mais recente. O horário é o `at` já registrado no evento; empates usam a representação ordenada do conteúdo, de forma determinística. Essa política escolhe uma versão ativa sem apresentar as duas respostas como tentativas independentes.

Todas as versões originais, inclusive a ativa, são preservadas em eventos `event-conflict`, que contêm `originalId` e `event`. Os IDs desses registros usam SHA-256 do conteúdo, portanto repetir a restauração ou sincronizar em ordem diferente não produz cópias sem fim. Esses registros não entram em acertos, erros, favoritos ou sessões; continuam disponíveis no JSON exportado e no principal do Drive. Não há descarte silencioso de variantes.

Os registros de recuperação são gravados localmente antes da substituição ativa. Uma falha de armazenamento desfaz tanto os novos registros quanto as substituições. Antes de mover lotes antigos para a lixeira, a conferência do principal exige a presença de cada original, como versão ativa ou registro de recuperação. Arquivos de outra conta, registros inválidos e resultados inconsistentes continuam sendo recusados. Os limites de tamanho e de eventos permanecem em vigor.

Não há nova permissão Google nem alteração do cliente OAuth. Abas anteriores a esta versão devem ser recarregadas para reconhecer os registros de recuperação e usar a reconciliação automática.

## Bancos diretamente do Drive

Em **Meus bancos → Buscar no Drive**, o app lista arquivos JSON da pasta, excluindo os diários de progresso. A seleção baixa e valida o arquivo antes de importá-lo. Ao conectar, novos bancos JSON são importados automaticamente sem substituir IDs existentes. Bancos importados pelo computador também são incluídos no histórico sincronizado e reaparecem em outro computador depois da conexão.

## Falhas comuns

| Mensagem | Verificação |
|---|---|
| ID OAuth não configurado | O responsável configura o ID global no build; veja LOGIN_GOOGLE.md |
| `origin_mismatch` | Autorize exatamente o domínio mostrado em Ajustes |
| Acesso bloqueado pelo Google | Configure consentimento, escopo e usuário de teste |
| Sem permissão na pasta | Conecte a conta proprietária ou com edição |
| Token de acesso expirado | Na produção Vercel, a renovação acontece automaticamente durante o uso |
| Permissão revogada ou sessão de renovação vencida | Reconecte o Google Drive; o progresso local é preservado |
| Popup bloqueado | Permita o popup e repita pelo botão |
| Arquivo inválido | Não renomeie arquivos arbitrários como `foco-progresso-*` |
| Falha de rede/cota | Preserve os dados locais e sincronize novamente após resolver |

## Referências oficiais

- [Google Identity Services — modelo de tokens](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Drive API — upload multipart](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Drive API — buscar arquivos](https://developers.google.com/workspace/drive/api/guides/search-files)
- [Drive API v2 — ETag do arquivo](https://developers.google.com/workspace/drive/api/reference/rest/v2/files)
- [Drive API v2 — atualização de conteúdo](https://developers.google.com/workspace/drive/api/reference/rest/v2/files/update)
- [Drive API — configuração privada appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Drive API — generateIds](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds)

Consentimento real e escrita do **site** precisam ser verificados após o cliente OAuth global estar configurado. Testes HTTP simulados e acesso do assistente à pasta não substituem essa verificação.

## Bancos do sistema — 1.18.0

Os bancos nativos são carregados do projeto e do catálogo público da plataforma, sem login ou Drive. Os seus bancos importados continuam pessoais. Renomeações usam eventos de metadados com IDs estáveis, sem renomear arquivos físicos. Questões, sessões e respostas identificam a origem Sistema/Pessoal. Versões históricas dos bancos nativos utilizados podem integrar o diário para conservar sessões e resultados; essas cópias não alteram o catálogo global. A sincronização usa o mesmo arquivo principal por conta. Consulte [BANCOS_SISTEMA.md](BANCOS_SISTEMA.md).

Os bancos globais são publicados exclusivamente pelo GitHub, na pasta `public/data/question-banks/`. O catálogo e as revisões são gerados no build; não existe gravação administrativa por Blob ou envio dos arquivos pessoais ao repositório.

## Exclusão individual de sessões — 1.21.0

**Minhas sessões → Excluir** remove somente a sessão escolhida, após confirmação. Respostas já contabilizadas e marcas continuam no progresso. O aplicativo registra um snapshot de sessão com `deleted: true` e `abandoned: true`, usando o tipo de evento já existente. A exclusão prevalece sobre estados posteriores de clientes offline, inclusive na reconciliação de colisões, sem apagar o diário nem fazer sessões antigas reaparecerem. Falhas de envio mantêm a exclusão local pendente; outra conta não é afetada. Backups continuam contendo os eventos históricos necessários para preservar progresso e sincronização.

A tag mostrada em estudos/sessões associados reflete o destino Sistema verificado por conteúdo. Uma nota informa a origem Pessoal preservada no histórico. Esse ajuste é de apresentação: não regrava IDs, respostas, gabaritos, nomes personalizados ou a origem da prova.
