# Relatório de verificação — 08/10/2026

## Executado

29 testes automatizados passaram em Node.js. Verificação de sintaxe de todos os módulos passou. O build estático foi gerado sem dependências de produção.

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

## Implementado, sem verificação em navegador

Os layouts possuem breakpoints de 1.200, 960 e 700 px, navegação inferior no celular, alternativas grandes, controles por toque, contraste claro/escuro e suporte a movimento reduzido. O controle de navegador exigido pelo ambiente de Sites não estava disponível; não foi realizado teste visual, toque em aparelho real ou ensaio de ponta a ponta dos botões no navegador. Isso também limita a verificação de popup OAuth, download e upload via seletor de arquivos.

## Integrações pendentes

- A pasta do Drive foi confirmada como “QConcursos IA” e estava vazia. A API de sincronização do site está implementada, mas o cliente OAuth próprio ainda não foi configurado. Consentimento, carga e escrita reais pelo frontend permanecem sem verificação. O estado inicial do site informa salvamento local.
- O GitHub foi dispensado. Nenhum repositório na conta do usuário foi criado ou consultado. O código possui README, guias, workflow GitHub Pages, configuração Vercel e versionamento no fluxo Sites.
- A hospedagem é concluída e verificada pelo resultado nativo de publicação. Esse resultado confirma entrega do site, não testes reais do Google OAuth nem UI em celular.

## Conferência após configurar OAuth

Conecte a conta proprietária em Ajustes. Responda uma questão, aguarde “Drive sincronizado” e confira o JSON criado na pasta. Em outro navegador, conecte a mesma conta e confirme a recuperação de respostas, bancos e favoritos. Depois responda em cada dispositivo, sincronize ambos e confira que o total contém as duas tentativas. Ao recarregar, conecte novamente: tokens não são persistidos.
