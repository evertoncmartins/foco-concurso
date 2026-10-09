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
