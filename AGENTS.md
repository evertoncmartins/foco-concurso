# Foco — destino autorizado

- O usuário definiu `https://github.com/evertoncmartins/foco-concurso.git` como repositório deste sistema em 09/10/2026 e autorizou o envio das próximas atualizações para ele.
- Envie as alterações concluídas para `evertoncmartins/foco-concurso`, na branch `main`, usando o plugin GitHub quando disponível. Preserve alterações remotas e confira a branch antes de atualizar; não force push.
- Quando houver acesso Git autenticado, utilize o remoto `github`. Não substitua o repositório administrado por Sites nem altere `.openai/hosting.json` para apontar ao GitHub.
- Registre o mesmo código nos destinos de versionamento usados pela tarefa. Quando alterar o site, publique também pelo fluxo de Sites, mantendo o endereço e a audiência existentes.
- Execute `npm test`, `npm run check` e `npm run build` antes de enviar alterações de código. GitHub Actions executa essas verificações automaticamente.
- GitHub Pages é opcional e manual. O usuário informou `https://foco-concurso-wine.vercel.app/` como endereço de produção em 09/10/2026. Use esse endereço nas orientações ao usuário; preserve a publicação administrada por Sites como espelho técnico.
- Não versione progresso pessoal, tokens ou credenciais. `dist/` é gerado pelo build e não deve ser versionado.

## Cards dos bancos — padrão permanente

- Exiba bancos de uma lei com título exclusivamente no formato `Lei nº número/ano`, sem siglas ou texto anterior. Exemplo: `Lei nº 8.069/1990`, nunca `ECA · Lei nº 8.069/1990`.
- Mantenha abaixo do título o nome descritivo: `Estatuto da Criança e do Adolescente`, `Servidores públicos federais` ou o nome informado para a outra lei.
- Aplique o mesmo padrão na tela Banco de questões e nos cards do início. Não force o nome de uma única lei em bancos mistos ou sem identificação segura, nem altere IDs, nomes originais exportados ou progresso.
- Preserve o design minimalista, os resumos de questões/instituições/período e as ações existentes. Exiba descrição breve, assuntos e origens em Ver mais detalhes; não coloque implementação ou curadoria na interface.
- Reutilize `bankPresentation` em `src/bank-view.mjs` para evitar divergências entre os cards.

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
- Mantenha histórico e filtros isolados por conta, respeite progressEpoch e deixe explícito que Zerar progresso afeta todos os bancos, mesmo com um filtro selecionado.
