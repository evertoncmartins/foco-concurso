# Modo escuro e navegação entre questões

Implementação de 23/11/2026 na branch `feat/dark-theme-session-performance`. Base da comparação: `caa885d8e0d5c6cb01a986d6c9fd5a7541678f16`. A `main`, a produção Vercel e o espelho Sites foram preservados conforme o pedido desta tarefa.

## Diagnóstico com profiling

O aplicativo usa módulos JavaScript e HTML; não há componentes React. A navegação anterior aguardava `Store.add()` e depois substituía todo o conteúdo de `#app`. Selecionar uma alternativa também chamava o renderizador completo.

O perfil de CPU do Chrome confirmou estes custos:

- `derive()` clonava e normalizava **todos** os snapshots históricos de sessão, incluindo filas e origens, antes de manter apenas a última versão de cada sessão.
- `Store.load()` relia, analisava e validava o diário inteiro repetidas vezes durante uma única gravação. A enumeração com `length`/`key()` reconstruía a lista de chaves muitas vezes.
- `Store.model()` reconstruía perguntas, estatísticas e histórico mesmo quando nenhum evento tinha mudado.
- A reconciliação calculava representações canônicas de todo o histórico mesmo para eventos novos, sem colisão de IDs.
- Cada `refresh()` do IndexedDB transferia o registro completo da conta, mesmo quando sua revisão não tinha mudado.
- A seleção recriava o menu, o cabeçalho, a questão e os inputs. Em 30 navegações e 20 seleções, ocorreram 50 substituições do layout principal.

O Drive já agrupava alterações com debounce de seis segundos e não era aguardado por `move()`. Esse mecanismo e os controles de conflitos, ETags, renovação Google e identidade foram mantidos. O gargalo medido era principalmente local.

## Alterações

### Interface e cache

- Selecionar atualiza as classes e os atributos acessíveis das alternativas e habilita o botão de registro, sem substituir a questão.
- Avançar e voltar substituem somente a área da sessão e atualizam o cabeçalho de foco. Menu, barra superior, inputs de arquivo e seus listeners permanecem.
- Eventos já validados são reutilizados enquanto sua representação persistida não muda. Registros novos ou alterados continuam sendo validados; corrupção e colisões continuam sendo recusadas ou reconciliadas.
- O modelo é reutilizado até mudar o diário, o catálogo ou o minuto corrente, para manter revisões temporais atualizadas.
- `derive()` normaliza apenas o último snapshot de cada sessão, preservando todos os eventos históricos.
- Um índice em memória resolve as questões do modelo atual e guarda as resoluções históricas por origem/revisão. Usa referências ao conteúdo já carregado; não baixa outros bancos nem faz prefetch desnecessário.
- Movimentos compartilham a fila e as origens imutáveis, copiando apenas o estado alterado.

### Persistência recuperável

`SessionWrites` registra uma cópia pequena, isolada por conta e operação, **antes** de aceitar a atualização visual. Ela omite somente a fila e as origens já salvas na criação da sessão. A fila assíncrona grava os eventos completos, em ordem, no diário e só depois retira essa cópia.

Uma recarga recupera operações com os mesmos IDs e timestamps. Repetir a recuperação não duplica tentativas. Falhas deixam a cópia pendente e mostram erro/repetição; falha na própria cópia impede aceitar a ação. Reset e exclusão de sessão continuam prevalecendo sobre ações antigas. Logout e troca de conta encerram a fila daquela conta.

Rascunhos de seleção e alternativas riscadas agora acompanham a questão na sessão, inclusive ao retornar e recarregar. A resposta registrada continua imutável; a pontuação e o sigilo de simulados não mudaram. Espaço pula a questão quando a região de estudo está focada, preservando a ação nativa da tecla em botões e campos.

O IndexedDB passa da versão 1 para 2 com um índice de revisões. As revisões e o diário são atualizados na mesma transação. Leituras sem alterações consultam apenas a revisão. A migração preserva os registros existentes e foi testada em um navegador real.

### Identidade visual

Referências consultadas no Monitor AVA: [tokens.css](https://github.com/evertoncmartins/monitor-ava/blob/main/src/appearance/tokens.css) e [dark-accents.css](https://github.com/evertoncmartins/monitor-ava/blob/main/src/appearance/dark-accents.css).

`public/assets/appearance/tokens.css` centraliza a paleta oficial: fundo `#121212`, painéis `#202020`, superfícies `#242424`/`#303030`, inputs `#262626`, menu `#181818`, primária verde-água `#79CCC2`, cores funcionais e foco azul. Os valores anteriores do tema claro foram preservados.

`dark-accents.css` aplica os tokens a controles, navegação, estados, notificações e foco. Grandes superfícies permanecem neutras; ícones recebem cores discretas. Correta, incorreta, selecionada e riscada continuam distinguíveis. Foram mantidos os layouts, os alvos de toque, as regras de rolagem e a preferência por movimento reduzido.

## Medições comparativas

Chrome 157, Windows, execução local sem throttling de CPU. Desktop de 1365 × 900 e viewport móvel de 390 × 844; o móvel é emulação de tamanho, não medição em aparelho físico. Dados sintéticos, IndexedDB real, seis movimentos de aquecimento, 30 navegações alternadas e 20 trocas de seleção por cenário.

Navegação: tempo do clique até dois `requestAnimationFrame` após a mudança do DOM, incluindo oportunidade de pintura. Seleção: duração síncrona do handler, sem alegar medir toda a pintura. O mesmo procedimento roda contra a base Git e a implementação atual. Resultados variam com equipamento e histórico.

| Cenário | Mediana antes | Mediana depois | p95 antes | p95 depois | Máximo depois |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop, 25 questões, 5 snapshots prévios | 36,6 ms | 35,8 ms | 80,9 ms | 36,9 ms | 37,2 ms |
| Desktop, 1.000 questões, 30 snapshots prévios | 1.318,0 ms | 36,1 ms | 1.618,3 ms | 38,9 ms | 39,6 ms |
| Viewport móvel, 1.000 questões, 30 snapshots prévios | 1.303,1 ms | 36,0 ms | 1.622,6 ms | 38,9 ms | 39,0 ms |

Em 1.000 questões, a mediana melhorou aproximadamente **97%**. A mediana do handler de seleção caiu de **111,8 para 0,4 ms** no desktop e de **115,5 para 0,3 ms** no viewport móvel. As substituições do layout principal caíram de **50 para zero**. As tarefas acima de 50 ms no intervalo medido caíram de **120 para zero** nesses dois cenários.

No teste adicional de **5.000 questões**, sem comparação histórica desse tamanho: mediana **36,4 ms**, p95 **53,5 ms**, máximo **60,3 ms** e seleção de **0,5 ms** de mediana. Houve **cinco tarefas acima de 50 ms** durante processamento do diário. Portanto, o teste sustenta a meta de navegação abaixo de 100 ms nessas condições, mas não sustenta ausência absoluta de tarefas longas em históricos maiores. O diário completo ainda preserva snapshots extensos.

Os resumos das execuções estão em `docs/performance-navigation.json`. Perfis de CPU e capturas locais são gerados em `.sites-runtime/performance/`, fora do versionamento.

## Verificação

- `npm test`: **480 aprovados, zero falhas, um teste ignorado já existente**; 481 testes ao todo.
- `npm run check`: sintaxe aprovada.
- `npm run build`: cinco bancos nativos descobertos e validados.
- `npm run test:browser`: fluxos desktop/móvel, seleção e troca de rascunhos, tesoura, Espaço e setas, navegação rápida, requisição real do Drive mantida pendente e depois recusada, operação offline após carga, recarga com operações pendentes, bancos nativos, simulado sem resultado antecipado, conclusão e migração IndexedDB 1 → 2.
- Testes novos de integridade: 500 movimentos numa sessão de 5.000 questões, ordem durante transação lenta, recuperação idempotente, falha de gravação/limpeza, cota cheia, isolamento de contas, reset e exclusão, validação de rascunhos, invalidação do cache e corrupção.
- Inspeção visual de questões, estados correto/incorreto/riscado, início, bancos, desempenho, ajustes e modal de sessão; capturas em tema claro e escuro, sem overflow horizontal nos viewports testados.
- O CI passa a executar também as regressões de navegador com Chromium.

O caminho de sincronização bem-sucedida, conflitos, repetição e consolidação do Drive continua coberto pelos testes existentes com serviço simulado. Não foi realizado login real nem envio à pasta pessoal do usuário. Não foram alterados credenciais, APIs administrativas, bancos de questões ou dados de produção. A validação móvel em Safari/iOS e Android físicos continua sendo um limite desta execução.

| Fronteira verificada | Evidência |
| --- | --- |
| Interação → interface | Seleção, corte e cursor conferidos no DOM; zero erros JavaScript nas execuções de navegador. |
| Interface → cópia local → diário | Recarga antes da transação recuperou rascunho e cortes; falhas conservaram operações pendentes. |
| Diário → recuperação e resultado | Reabertura preservou respostas e tentativas; migração 1 → 2 conservou registros; simulado só pontuou após conclusão. |
| Cliente → Drive → erro | Requisição real interceptada e mantida pendente durante 50 movimentos; rejeição exibiu estado de erro e conservou três tentativas após operação offline/recarga. |
| Build e ambiente | Cinco bancos descobertos; servidor local sem credenciais de produção; testes aprovados e servidor de QA encerrado por cada runner. |

## Reproduzir

```text
npm ci
npm test
npm run check
npm run test:browser
npm run profile:navigation -- after
npm run profile:navigation -- before caa885d8e0d5c6cb01a986d6c9fd5a7541678f16
```

O runner usa Chrome instalado. Para Chromium: `npx playwright-core install chromium` e `FOCO_BROWSER_CHANNEL=chromium`. Também aceita `FOCO_BROWSER_PATH` com o caminho do executável. `FOCO_PROFILE_MAX=1` acrescenta o cenário de 5.000 questões. No PowerShell, use `npm.cmd` se a política local bloquear `npm.ps1`.

O servidor de testes é local, usa porta temporária e é encerrado ao final. Os hooks de fixture são injetados somente pelo runner e não entram no aplicativo publicado.
