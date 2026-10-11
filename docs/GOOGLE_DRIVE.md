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

Se a autorização retornada no login incluir o acesso Drive já concedido, a recuperação do progresso acontece automaticamente. Se o Google solicitar nova permissão, o app recupera a pasta e oferece **Autorizar minha pasta**. Nenhum token é persistido. Se o usuário apagar os dados do aplicativo nas configurações do Drive, precisará informar a pasta novamente; os arquivos de progresso da pasta escolhida não são removidos pelo app.

## Durante o estudo

Após conectar, o sistema localiza o arquivo `foco-progresso-<sub>-principal.json`, confirma a propriedade da conta e do conteúdo, valida os eventos e une os históricos remoto e local. Em seguida atualiza esse mesmo arquivo quando há alterações locais. Se não houver histórico, cria o principal automaticamente. A versão do arquivo fica em cache: se o conteúdo remoto não mudou e os eventos estão disponíveis localmente, o app evita baixar o JSON novamente.

Cada mudança é salva localmente imediatamente. Com autorização ativa, o envio ao Drive ocorre após 6 segundos de inatividade; concluir uma sessão também dispara uma sincronização. O botão Sincronizar permite executar o processo manualmente. Ao voltar ao site ou recuperar a rede, a sincronização é tentada enquanto o token continua válido.

Após recarregar/abrir o site, é necessário entrar com Google novamente. Tokens são temporários e mantidos só em memória, seguindo o modelo de tokens da Google Identity Services. Ao expirar, o site mostra “Reconectar Drive”; os dados locais continuam salvos. Não existe envio em segundo plano com o navegador fechado.

## Arquivo único e migração (1.7.0)

O principal contém o histórico completo de eventos, deduplicados por UUID. Na primeira conexão após a atualização, os lotes `foco-progresso-<sub>-*.json` das versões anteriores são lidos, validados e reunidos com o progresso local. Um dos arquivos existentes é atualizado e renomeado para principal, preservando seu ID. O app baixa e confere o conteúdo gravado antes de mover os demais arquivos incorporados para a lixeira. A limpeza é reversível e não esvazia a lixeira, nem afeta bancos JSON ou dados de outras contas. Uma migração interrompida pode ser retomada ao sincronizar novamente.

## Evitar perdas e sobrescritas

As gravações usam o ETag do recurso de arquivo da API Drive v2 em `If-Match`. Se outro dispositivo modifica o arquivo depois da leitura, o Drive recusa a gravação com 412. O Foco relê a versão atual, une os históricos e tenta novamente, com limite de seis tentativas por sincronização. A limpeza dos lotes também usa sua versão exata: um lote alterado precisa ser incorporado novamente antes de ir para a lixeira. A API v3 permanece responsável por listagem, criação e download. Não há novo banco de dados, escopo OAuth ou segredo de servidor.

Bancos, respostas, marcações e sessões continuam como eventos. Um evento idêntico já existente não aumenta tentativas novamente. Mesmo ID com conteúdos diferentes interrompe a união com mensagem explícita. Evite responder à mesma sessão simultaneamente em dois dispositivos; sessões independentes se unem normalmente. Alterações locais recebidas durante um envio são incluídas na próxima atualização do principal.

O cache local guarda IDs de eventos/arquivos confirmados, ETags e, durante a primeira criação, um envio pendente com ID estável. Nunca guarda tokens. Falhas de leitura não são interpretadas como histórico vazio. Criações simultâneas em uma pasta vazia podem gerar dois principais temporariamente; a sincronização os reúne e mantém um único arquivo ativo. Clientes antigos ainda abertos podem gerar lotes, que a nova versão incorpora na próxima sincronização. Atualize todas as abas e dispositivos para utilizar o fluxo novo.

## Bancos diretamente do Drive

Em **Meus bancos → Buscar no Drive**, o app lista arquivos JSON da pasta, excluindo os diários de progresso. A seleção baixa e valida o arquivo antes de importá-lo. Ao conectar, novos bancos JSON são importados automaticamente sem substituir IDs existentes. Bancos importados pelo computador também são incluídos no histórico sincronizado e reaparecem em outro computador depois da conexão.

## Falhas comuns

| Mensagem | Verificação |
|---|---|
| ID OAuth não configurado | O responsável configura o ID global no build; veja LOGIN_GOOGLE.md |
| `origin_mismatch` | Autorize exatamente o domínio mostrado em Ajustes |
| Acesso bloqueado pelo Google | Configure consentimento, escopo e usuário de teste |
| Sem permissão na pasta | Conecte a conta proprietária ou com edição |
| Token expirado | Clique Conectar Google Drive novamente |
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
