# Relatório de verificação — 08/10/2026

## Executado

59 testes automatizados passaram em Node.js na versão 1.2.0. Verificação de sintaxe de todos os módulos passou. O build estático foi gerado sem dependências de produção.

| Fluxo | Evidência |
|---|---|
| Importar banco JSON | Banco inicial e modelo validados; versões, IDs, alternativas e gabaritos inválidos recusados |
| Iniciar sessão | Criação de fila limitada, selecionada por banco/filtros e sem repetição |
| Responder corretamente | Acerto e dados de desempenho registrados |
| Responder incorretamente | Erro, última alternativa e prazo de revisão registrados |
| Salvar progresso | Eventos gravados em armazenamento local; erro de cota não confirma sucesso |
| Recarregar e recuperar | Nova instância recupera respostas, marcações e sessão pausada |
| Favoritar | Marcação e remoção persistidas com último estado |
| Marcar revisão | Marcação manual e revisão vencida retornam no modo adequado |
| Revisar erros | Última resposta errada entra; correção retira a questão, preservando o histórico |
| Simulado | Rascunho persistido; desempenho emitido apenas ao concluir |
| Duas abas | Chaves independentes preservam eventos de ambas |
| Dois dispositivos | Adaptador Drive testado com API simulada une eventos sem PATCH/DELETE |
| Upload interrompido | Lote pendente retoma pelo mesmo ID; conclusão incerta não duplica arquivo |
| Falha de leitura no Drive | JSON inválido ou busca incompleta interrompe envio e preserva dados |
| Segurança da importação | URL executável rejeitada e dados de resultados inconsistentes recusados |

## Atualização de login e múltiplas contas

17 testes de conta passaram (incluídos nos 59): isolamento de respostas/configurações/cache no mesmo navegador, não atribuição automática do legado, proprietário nos backups, perfil Google verificado, validação de pasta, autorização incremental, recusa de conta trocada, arquivos de outro proprietário e encerramento de sessão. Google UserInfo e consentimento foram simulados; não comprovam acesso real.

## Configuração privada entre dispositivos — 1.2.0

13 testes adicionais de configuração e integração Drive passaram (incluídos nos 59). A API foi simulada: criação e busca em `appDataFolder`, navegador sem dados locais recuperando pasta/bancos/resposta/favorito, contas distintas, migração da pasta antiga após validar acesso, preferência remota sobre local antiga, pasta inválida, falha de leitura, upload interrompido, resposta perdida sem duplicação, envio antigo bloqueado após mudança remota, escolhas simultâneas, documento de outra conta e logout durante requisição. Os testes de autorização também verificam o novo escopo, a recusa da permissão sem bloquear estudo local e o reaproveitamento das permissões Drive anteriores.

O build inclui `drive-settings.mjs`. A implementação não persiste tokens e mantém configurações e progresso em espaços separados. A declaração de `drive.appdata` no Google Cloud e o consentimento real dessa nova permissão não foram feitos nesta atualização. O console estava indisponível para automação; a alteração de código não modifica o estado de publicação/verificação do OAuth.

## Implementado, sem verificação em navegador

Os layouts possuem breakpoints de 1.200, 960 e 700 px, navegação inferior no celular, alternativas grandes, controles por toque, contraste claro/escuro e suporte a movimento reduzido. O controle de navegador exigido pelo ambiente de Sites não estava disponível; não foi realizado teste visual, toque em aparelho real ou ensaio de ponta a ponta dos botões no navegador. Isso também limita a verificação de popup OAuth, download e upload via seletor de arquivos.

## Integrações pendentes

- A pasta do Drive foi confirmada como “QConcursos IA” e estava vazia. Em 08/10/2026, foi criado o projeto Google Cloud `foco-estudos-ecm` e o cliente Web `Foco Web`, com a origem exata do site e seu ID público no build. O OAuth está em modo de teste, com a conta do responsável na lista de teste. Consentimento, carga e escrita reais pelo frontend permanecem sem verificação; a configuração no console não substitui esse teste.
- A API do Drive foi confirmada como ativada no console. Os quatro escopos de perfil/Drive foram salvos, e a conta de teste foi confirmada na tabela de usuários. O nome de consentimento salvo é “Foco Estudos Concursos”. Não foram realizados login no site, consentimento ou gravação real de progresso nesta configuração.
- O GitHub foi dispensado. Nenhum repositório na conta do usuário foi criado ou consultado. O código possui README, guias, workflow GitHub Pages, configuração Vercel e versionamento no fluxo Sites.
- A hospedagem é concluída e verificada pelo resultado nativo de publicação. Esse resultado confirma entrega do site, não testes reais do Google OAuth nem UI em celular.

## Conferência após configurar OAuth

Declare `https://www.googleapis.com/auth/drive.appdata` em Google Auth Platform → Acesso a dados. Entre novamente e conecte sua conta em Ajustes; confirme a indicação de pasta salva na conta Google. Responda uma questão, aguarde “Drive sincronizado” e confira o JSON criado na pasta. Em outro navegador sem dados locais, entre com a mesma conta e confirme que o ID da pasta reaparece sem colar o link. Autorize o Drive se necessário e confirme a recuperação de respostas, bancos e favoritos. Depois responda em cada dispositivo, sincronize ambos e confira que o total contém as duas tentativas. Ao recarregar, conecte novamente: tokens não são persistidos.


## Atualização visual 1.3.0 — 09/10/2026

A tela de entrada foi reorganizada em uma coluna no celular, com um único título principal, botão Google de 54 px e descrição curta. No desktop, há apresentação lateral e cartão de acesso. Foram mantidos os temas claro/escuro e a autenticação existente.

O início passou a usar `home-view.mjs` e `home.css`, com estilos específicos: saudação, ação para iniciar/retomar, meta diária integrada, resumo compacto, quatro modos de estudo, até três bancos e atividade dos últimos sete dias. Contagens dos atalhos respeitam bancos desativados; nenhum dado demonstrativo é apresentado como progresso real. O cabeçalho e a navegação inferior têm alvos maiores no celular e consideram a área segura do dispositivo. A tela de resolução mantém seu layout.

Os 59 testes existentes passaram novamente. Verificação de sintaxe dos módulos e `git diff --check` passaram. Sete variantes de HTML foram geradas e inspecionadas por parser: início, sessão pausada, ausência de bancos, falha de conexão, banco desativado, entrada normal e entrada em carregamento. Foram conferidos títulos, IDs, rótulos acessíveis, estado dos botões e escape de conteúdo. Isso verifica o HTML gerado, não a interação ou o layout em navegador.

A infraestrutura de navegador para Sites continuava indisponível. Aparência final, toque, ausência de overflow em aparelho real e popup Google não foram verificados nesta atualização. O código possui regras para celulares pequenos (até 360 px), celular/tablet (até 700 px), início em telas maiores (a partir de 701 px) e entrada em duas colunas (a partir de 901 px).


## Simplificação da entrada 1.3.1 — 09/10/2026

A tela de login foi reduzida à identidade Foco, uma frase de orientação e ao botão Google. A troca de tema permanece discreta no canto superior. Foram removidos a apresentação lateral, os blocos de benefícios, o ícone ilustrativo e as frases adicionais. Celular e desktop usam uma composição única centralizada. Erros, carregamento e configuração ausente continuam explícitos. A autenticação e a página após entrar permanecem as mesmas.

Foram verificadas a sintaxe dos módulos e as variantes HTML de acesso normal, carregamento, erro e configuração ausente. Não foram criados novos testes para a alteração visual. A inspeção visual em navegador/aparelho real segue indisponível.

## Modo foco e menu recolhível 1.4.0 — 09/10/2026

Durante uma sessão no desktop, o botão no canto superior direito ativa um layout sem menu e solicita tela cheia nativa. O documento raiz permanece estável durante o redesenho de respostas, comentários e próximas questões. A saída nativa (incluindo Esc), o botão de saída, a pausa, a conclusão e a mudança para largura de celular restauram a interface. Se o navegador recusar tela cheia ou não oferecer essa API, o layout de foco continua disponível com aviso. O menu pode ser recolhido para uma coluna de ícones com nomes acessíveis e títulos; a preferência é salva por conta neste navegador e preservada ao entrar/sair do modo foco.

67 testes automatizados passaram, incluindo oito cenários de tela cheia simulada: entrada e redesenho, saída nativa, permissão recusada, API ausente, mudança de largura, saída durante entrada pendente, cliques repetidos e preservação de tela cheia iniciada fora do modo foco. Uma execução adicional do código real da aplicação com DOM e eventos simulados verificou recolher/recuperar menu, isolamento da preferência entre contas, seleção preservada ao entrar/sair, resposta correta, próxima questão, Esc, conclusão, simulado sem gabarito antecipado e pausa.

A sintaxe e o build foram verificados. Esses ensaios não comprovam a aparência nem a tela cheia no navegador real. O recurso de navegador exigido pelo ambiente de Sites continua indisponível; não houve teste visual de desktop ou celular nesta atualização.

## Login, restauração e visitante 1.5.0 — 09/10/2026

O acesso com Google exibe uma tela de restauração e bloqueia navegação e respostas antes de recuperar a pasta, o histórico e os bancos. O andamento representa etapas concluídas, com contagem dos arquivos lidos e validados; não estima bytes nem avança por temporizador. Permissão ausente solicita autorização. Falhas permitem tentar novamente, voltar ao login ou escolher explicitamente os dados deste navegador, informando que o Drive não foi restaurado. A sincronização automática após respostas continua em segundo plano.

A entrada mostra os recursos principais, a utilidade da conexão Google/Drive e a alternativa de visitante. Visitantes usam uma instância de armazenamento apenas em memória. Bancos, respostas, favoritos e estatísticas temporários são descartados ao sair/recarregar, sem ler nem alterar o histórico de contas Google. Somente a aparência pode ser lembrada. A interface avisa que o progresso é temporário e não exibe confirmação de salvamento persistente. O modo foco inclui troca de tema sem perder seleção ou tela cheia. O tema escuro usa fundos cinza neutros; cores de acerto e erro permanecem semânticas.

75 testes automatizados passaram. Os oito cenários adicionais verificam memória temporária e isolamento, progresso por etapa/arquivo, leitura concluída antes de avançar o contador, arquivo inválido, bloqueio do aplicativo durante recuperação, falha e repetição, autorização/fallback local explícito e respostas/tema no modo foco como visitante. A verificação do aplicativo executa seus manipuladores reais com DOM e rede simulados. A sintaxe, o build estático e os estados HTML de login/restauração também foram conferidos.

Navegador real e consentimento Google real não foram usados nesta atualização. A inspeção visual de desktop/celular segue indisponível no ambiente de Sites. Os testes confirmam lógica e HTML, não aparência, animação ou consentimento real.

## Cores dos temas 1.5.1 — 09/10/2026

O tema claro usa #00001F em botões principais, seleções e destaques, com superfícies claras de tom frio. O tema escuro conserva fundos cinza neutros. Ícones de estudo, favoritos, revisão, sequência diária, troca de tema e detalhes de progresso recebem acentos discretos em azul, violeta, âmbar e rosa. O verde permanece apenas no feedback semântico de acertos.

Foram conferidos a sintaxe dos módulos, o build estático e `git diff --check`. Os pares principais de texto/botões e os acentos sobre seus fundos foram calculados pela fórmula WCAG, com contraste mínimo de 4,5:1. Não foram criados testes novos para a alteração visual. Aparência, responsividade e animações em navegador real permanecem sem verificação, pois o recurso de navegador de Sites está indisponível neste ambiente.

## Política de Privacidade 1.5.2 — 09/10/2026

Foi adicionada a página estática pública `privacidade.html`, sem dependência de login, consentimento Google ou carregamento da aplicação. O texto descreve as práticas observadas no código: identidade, estudos, armazenamento local e no Drive, autorização ampla atual, configuração privada, visitante, retenção, compartilhamento, Uso Limitado, exportação, revogação e exclusão. O contato remete ao e-mail de suporte definido no consentimento OAuth. Os links foram incluídos na entrada e em Ajustes; o guia de configuração informa o endereço para cadastrar no Google Auth Platform.

75 testes existentes passaram. A sintaxe e `git diff --check` passaram. A inspeção HTML conferiu título principal, hierarquia de seções, IDs únicos, âncoras, caminhos locais e carregamento independente de OAuth; o HTML gerado da entrada mantém o link nos estados normal, indisponível e carregando. O build inclui a página e seu CSS. Não foram criados testes novos para a alteração de conteúdo. A publicação da página não modifica o modo de teste OAuth nem comprova aprovação jurídica ou verificação Google. Aparência em navegador real permanece sem verificação no ambiente de Sites.

## Termos de Serviço 1.5.3 — 09/10/2026

Foi adicionada a página pública `termos.html`, com o mesmo estilo da Política de Privacidade e acesso independente de login. O documento descreve finalidade educacional, acesso Google/visitante, conteúdo importado, progresso e Drive, uso permitido, propriedade intelectual, disponibilidade, responsabilidades, encerramento e contato. Os links foram incluídos na entrada, em Ajustes e entre os dois documentos. O guia OAuth informa o endereço para o campo Termos de Serviço.

75 testes existentes passaram, assim como a sintaxe e `git diff --check`. A inspeção das duas páginas conferiu estrutura HTML, IDs únicos, título principal, arquivos locais, âncoras e ausência de OAuth. Os links dos documentos foram conferidos nos estados da entrada. O build inclui as duas páginas e seus recursos. Não foram criados testes novos para a alteração de conteúdo. Não houve verificação visual em navegador real nem aprovação jurídica; a publicação não modifica o status OAuth no Google Cloud.

## Área completa no modo foco desktop 1.5.4 — 09/10/2026

O modo foco remove os limites de largura do conteúdo, da barra de ferramentas e do contêiner da sessão no desktop. O espaço de estudo acompanha a altura da viewport, e o cartão e as alternativas distribuem o espaço disponível. Texto, margens, letras das alternativas e espaçamentos variam com limites mínimos/máximos, sem escalar ou distorcer o documento. Telas baixas usam espaçamento compacto; enunciados, alternativas e comentários longos podem expandir a página com rolagem. A mudança fica em consultas de mídia a partir de 701 px, preservando as regras mobile e o comportamento de tela cheia, saída e troca de tema.

75 testes existentes passaram, assim como a sintaxe dos módulos e `git diff --check`. A análise estrutural do CSS conferiu chaves, declarações e regras por dimensão: em 320×568, 390×844 e 700×900, as regras mobile são idênticas à versão anterior; em cinco tamanhos desktop, de 701×600 a 3840×2160, as mudanças ficam restritas ao modo foco. O build estático inclui o CSS atualizado. Essa análise não mede o layout renderizado. Não foram criados testes novos para a alteração visual. Aparência e distribuição real do espaço em navegador permanecem sem verificação, pois o recurso de navegador exigido pelo ambiente de Sites está indisponível.

## Carregamento Google e abertura do login 1.5.5 — 09/10/2026

O botão Google aguarda a biblioteca estar pronta, e o pedido de token passa a executar diretamente no clique antes de qualquer `await`. O carregamento valida a presença da API, tem limite de 20 segundos, remove scripts malsucedidos e permite uma nova carga explícita. A carga não inicia autorização sozinha; o visitante permanece disponível. A callback de erro distingue falha de abertura, fechamento antecipado e erro desconhecido, substituindo a mensagem genérica vista na captura enviada pelo usuário. Bloqueios impostos por permissões, extensões ou políticas do navegador continuam possíveis; não foi confirmada a causa no perfil habitual do usuário.

86 testes passaram, incluindo 11 novos cenários: abertura síncrona, biblioteca ausente, erros distintos e repetição manual, falha desconhecida, carga compartilhada, falha/repetição, API inválida, tempo limite, espera do botão, recuperação na entrada e repetição após erro de popup. Os testes executam os módulos e manipuladores reais com Google/DOM simulados. Sintaxe, `git diff --check` e build também foram conferidos. Login no Google real e o perfil habitual do usuário permanecem sem verificação no ambiente de Sites; o status de publicação/verificação no Google Auth não foi consultado nem alterado.


## Login preparado e sessão na área útil 1.5.6 — 09/10/2026

O relato informa que o cadastro OAuth foi corrigido e o Edge entra, mas Chrome e Firefox ainda retornam falha de abertura. Isso não comprova a causa nos perfis desses navegadores. A biblioteca e agora também o cliente de token são preparados antes de liberar a entrada. O clique somente solicita a autorização; não há repetição automática. Cada tentativa usa callbacks próprios e descarta respostas tardias depois de concluir. A falha oferece instruções específicas para permitir janelas somente no endereço do Foco, links oficiais de ajuda e abertura do site em uma aba. O aplicativo não altera permissões do navegador nem esconde a falha.

Fora da tela cheia, a sessão desktop usa a altura útil da janela, com cabeçalho e espaçamentos compactos. O corpo da questão tem rolagem interna somente quando o conteúdo não cabe, mantendo os botões de resposta/próxima questão e o resumo disponíveis. A mesma questão mantém a posição ao selecionar, favoritar ou trocar tema; avançar reinicia a posição. Não há redução ilimitada da fonte, corte do conteúdo ou bloqueio geral da rolagem. No foco, o novo agrupamento usa `display: contents` e conserva o layout proporcional.

90 testes passaram. Foram acrescentados quatro cenários relevantes: preparar o cliente sem abrir autorização e usá-lo no clique; ignorar callbacks da tentativa anterior; substituir o cliente ao trocar o ID público; preservar a rolagem na mesma questão e reiniciar ao avançar. O teste de entrada verifica a preparação antecipada e a ajuda contextual. Os módulos e manipuladores reais executam com DOM/Google simulados. Sintaxe e `git diff --check` passaram. A análise estrutural do CSS confirmou regras mobile idênticas em 320×568, 390×844 e 700×900, e a delimitação da sessão em cinco tamanhos desktop. Essa análise não mede o layout renderizado. O navegador exigido pelo ambiente Sites está indisponível; aparência e login real no Chrome/Firefox permanecem sem verificação.
