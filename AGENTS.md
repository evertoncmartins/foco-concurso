# Foco — destino autorizado

- O usuário definiu `https://github.com/evertoncmartins/foco-concurso.git` como repositório deste sistema em 09/10/2026 e autorizou o envio das próximas atualizações para ele.
- Envie as alterações concluídas para `evertoncmartins/foco-concurso`, na branch `main`, usando o plugin GitHub quando disponível. Preserve alterações remotas e confira a branch antes de atualizar; não force push.
- Quando houver acesso Git autenticado, utilize o remoto `github`. Não substitua o repositório administrado por Sites nem altere `.openai/hosting.json` para apontar ao GitHub.
- Registre o mesmo código nos destinos de versionamento usados pela tarefa. Quando alterar o site, publique também pelo fluxo de Sites, mantendo o endereço e a audiência existentes.
- Execute `npm test`, `npm run check` e `npm run build` antes de enviar alterações de código. GitHub Actions executa essas verificações automaticamente.
- GitHub Pages é opcional e manual. O usuário informou `https://foco-concurso-wine.vercel.app/` como endereço de produção em 09/10/2026. Use esse endereço nas orientações ao usuário; preserve a publicação administrada por Sites como espelho técnico.
- Não versione progresso pessoal, tokens ou credenciais. `dist/` é gerado pelo build e não deve ser versionado.

## Cards dos bancos — padrão permanente

- Exiba bancos do sistema de uma lei com título exclusivamente no formato `Lei nº número/ano`, sem siglas ou texto anterior. Em bancos pessoais, preserve a apresentação automática anterior até o usuário escolher um `displayName`; depois respeite exatamente o nome escolhido, mesmo contendo siglas ou outro formato.
- Mantenha abaixo do título o nome descritivo: `Estatuto da Criança e do Adolescente`, `Servidores públicos federais` ou o nome informado para a outra lei.
- Aplique o mesmo padrão na tela Banco de questões e nos cards do início. Não force o nome de uma única lei em bancos mistos ou sem identificação segura, nem altere IDs, nomes originais exportados ou progresso.
- Preserve o design minimalista, os resumos de questões/instituições/período e as ações existentes. Exiba descrição breve, assuntos e origens em Ver mais detalhes; não coloque implementação ou curadoria na interface.
- Reutilize `bankPresentation` em `src/bank-view.mjs` para evitar divergências entre os cards.
- Na configuração de uma sessão, reutilize os mesmos títulos e subtítulos dos cards. Não exponha os nomes técnicos originais no seletor de bancos nem altere IDs para padronizar a apresentação.

## Origens e administração

- Bancos nativos ficam em `public/data/question-banks/lei-NUMERO.json`. O build descobre os arquivos e gera `dist/data/question-banks/index.json`; não manter índice manual no código-fonte. Carregue-os sem depender do Drive ou do login. Nunca trate um JSON pessoal que declare Sistema como autoridade do catálogo.
- Não embutir bancos de demonstração em `src/` ou nos assets públicos. Fixtures ficam em `tests/fixtures/`; os bancos nativos vêm exclusivamente da pasta oficial.
- Preserve `bankId`, `sourceType` e `displayName` em sessões, questões e respostas. Não use nomes para relacionar progresso. IDs reservados pessoais antigos são traduzidos sem apagar o diário; não remapeie respostas novas explicitamente originadas do sistema.
- Renomeação pessoal usa evento `bank-metadata`; não reimporte o banco nem troque IDs para alterar um nome. Prefira as tags discretas Sistema/Pessoal, mantendo o Mobile compacto.
- Por solicitação do usuário em 16/10/2026, o catálogo global é administrado exclusivamente pelo GitHub. A API é somente leitura e o painel não oferece gravações de bancos do sistema. Não reintroduzir Blob ou permissões administrativas Google para essa finalidade.
- Gere revisões pelo conteúdo e preserve snapshots e IDs de questões ao atualizar arquivos. Espelhos consultam o catálogo público e os arquivos da produção, com fallback local. Veja `docs/BANCOS_SISTEMA.md`.

## Reinício de estudos

- Zerar progresso exige confirmação explícita e afeta apenas respostas, estatísticas, favoritos, revisões e sessões da conta atual. Preserve nome, conta, foto, preferências, pasta e bancos importados, incluindo seus estados de ativação.
- Preserve o marcador `progress-reset` e a associação `progressEpoch` dos eventos de estudo. Não implemente reset apagando localStorage ou apenas retirando eventos locais: dispositivos offline e backups poderiam reativar o histórico antigo.
- Teste cancelamento, falha de gravação/envio, outra conta, nova sessão e sincronização antes de publicar mudanças nesse fluxo.
- Após confirmar o reset, mantenha o loading exclusivo de salvamento até o envio terminar, com etapas reais e liberação em sucesso ou falha. Não aplique esse bloqueio às sincronizações comuns nem reutilize o estado de restauração do login para o reset.

## Renovação Google

- Preserve a renovação automática do Drive na produção por POST de mesma origem, sem abrir popup ou redirecionar durante os estudos. Tokens de acesso ficam em memória; a credencial de renovação usa cookie cifrado HttpOnly/Secure, nunca JSON, localStorage, logs ou respostas públicas.
- Verifique a mesma conta na renovação, descarte retornos após logout/desconexão e mantenha progresso local e sessão de estudo em falhas. Não prolongue artificialmente a validade fornecida pelo Google nem repita indefinidamente uma requisição recusada.

## Sessões e resultados

- Preserve todas as sessões ao iniciar ou retomar outra. A consulta de resultado concluído não deve substituir a sessão ativa, alterar respostas ou criar tentativas; revisar erros é uma nova sessão por ação explícita.
- Resultados históricos usam o gabarito registrado e as versões de bancos já presentes no diário, sem recalcular a nota com um banco atualizado. Conteúdo ausente não deve reduzir o total original ou esconder sua indisponibilidade.
- Nunca revele gabarito, acertos ou erros de simulados em andamento. Filtros por banco/lei e tipo apenas restringem consultas; sessões mistas pertencem a todos os bancos da fila.
- Nos filtros de banco/lei, mostre bancos atuais e removidos apenas quando estes tenham sessões consultáveis ou respostas na etapa atual. Não liste toda importação antiga nem apague eventos para ocultar opções sem estudo.
- Mantenha histórico e filtros isolados por conta, respeite progressEpoch e deixe explícito que Zerar progresso afeta todos os bancos, mesmo com um filtro selecionado.

## Documentação e navegação

- A ajuda de formato JSON, o modelo e o schema ficam em Banco de Questões, junto da importação. Evite duplicar esses recursos em Ajustes; mantenha ali os links de Termos e Política.
- Documentos abertos dentro do aplicativo preservam a página de origem, rolagem e campos em edição da mesma sessão autenticada. Voltar ao Foco retorna a Ajustes ou Banco de Questões conforme a origem, sem forçar Home, refazer login ou restaurar o Drive.
- Sem autenticação, o retorno continua no login e aguarda o clique explícito em Continuar com Google. Não recupere login por cookie no retorno dos documentos nem aplique o contexto de uma conta após logout/troca de conta.
