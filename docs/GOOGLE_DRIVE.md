# Google Drive — configuração e funcionamento

## Configurar uma vez

O responsável pela plataforma configura um cliente OAuth público único. Leia [LOGIN_GOOGLE.md](LOGIN_GOOGLE.md). Os estudantes apenas entram com Google e escolhem sua pasta do Meu Drive. Não precisam criar projetos no Google Cloud.

Cada usuário informa o ID ou link da pasta durante a primeira entrada, ou em Ajustes. A conta conectada precisa ter permissão para adicionar arquivos. As pastas não são alteradas pelo sistema e os arquivos herdam suas permissões; use uma pasta privada para histórico pessoal.

## Durante o estudo

Após conectar, o sistema localiza seus JSONs `foco-progresso-<sub>-*.json`, confirma a propriedade da conta e do conteúdo, carrega arquivos ainda não lidos, valida os eventos e une os históricos. Em seguida envia alterações locais. Se não houver arquivo, cria o primeiro automaticamente.

Cada mudança é salva localmente imediatamente. Com autorização ativa, o envio ao Drive ocorre após 6 segundos de inatividade; concluir uma sessão também dispara uma sincronização. O botão Sincronizar permite executar o processo manualmente. Ao voltar ao site ou recuperar a rede, a sincronização é tentada enquanto o token continua válido.

Após recarregar/abrir o site, é necessário entrar com Google novamente. Tokens são temporários e mantidos só em memória, seguindo o modelo de tokens da Google Identity Services. Ao expirar, o site mostra “Reconectar Drive”; os dados locais continuam salvos. Não existe envio em segundo plano com o navegador fechado.

## Evitar perdas e sobrescritas

Sem backend central, uma gravação de um único `progresso.json` poderia substituir respostas enviadas por outro computador. Para evitar isso, o Foco usa um diário composto por **lotes JSON imutáveis**. Um lote contém somente novos eventos e nunca reescreve outro lote. A união por ID produz o progresso consolidado de cada dispositivo.

- Bancos, respostas, marcações e snapshots das sessões são eventos.
- Dois dispositivos criam lotes diferentes; suas respostas são preservadas.
- Um evento idêntico já existente não aumenta tentativas novamente.
- Mesmo ID com conteúdos diferentes interrompe a união com mensagem explícita.
- Antes do upload, o app solicita um ID de arquivo ao Drive e salva o lote pendente localmente. Uma repetição usa o mesmo ID. Em caso de HTTP 409, o app só aceita o arquivo após conferir conteúdo idêntico.
- Se o upload falhar, o lote e o histórico continuam no dispositivo. O estado não exibe “sincronizado”.
- Alterações recebidas durante um envio ficam para o lote seguinte.
- Não remova os lotes do Drive; são o histórico permanente. A exportação gera um JSON consolidado para backup. Uma rotina automática de compactação exigiria coordenação adicional e não está incluída.
- Evite responder à mesma sessão simultaneamente em dois dispositivos. Sessões independentes se unem normalmente; respostas diferentes com o mesmo ID de tentativa geram conflito detectado.

O cache local guarda apenas IDs de eventos/arquivos confirmados e um lote pendente. Nunca guarda tokens. Falhas de leitura não são interpretadas como histórico vazio.

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
- [Drive API — generateIds](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds)

Consentimento real e escrita do **site** precisam ser verificados após o cliente OAuth global estar configurado. Testes HTTP simulados e acesso do assistente à pasta não substituem essa verificação.
