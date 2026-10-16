# Foco — Estudos para concursos

Plataforma para resolver questões e estudar para qualquer concurso com seus próprios bancos JSON. HTML5, CSS3 e JavaScript em módulos ES, com catálogo público de bancos e progresso pessoal em JSON, sem banco de dados tradicional.

## Funcionalidades

- Tema claro com botões e destaques em azul profundo (#00001F), escuro em cinza neutro e automático; detalhes discretos em azul, violeta, âmbar e rosa nos dois temas; navegação adaptada para celulares.
- Login com Google ou acesso como visitante. No Vercel, o login pode redirecionar na mesma aba e retornar automaticamente, usando código OAuth e PKCE. A ativação requer configuração do servidor e do endereço de retorno no Google. Até a ativação e em hospedagens estáticas, o acesso usa a janela Google preparada antes do clique. No modo visitante, dados ficam apenas em memória e são descartados ao sair/recarregar.
- Política de Privacidade pública, acessível sem login em `privacidade.html`, com link na entrada e em Ajustes.
- Termos de Serviço públicos em `termos.html`, com links na entrada, em Ajustes e na Política de Privacidade. Os termos, política e guia JSON abrem dentro do aplicativo, preservando a sessão já ativa. Voltar ao Foco retorna ao início quando autenticado e à entrada quando deslogado, sem login automático.
- Restauração inicial do Drive bloqueia o estudo até concluir, com progresso por etapas e contagem de arquivos; erros e autorização ausente têm recuperação explícita.
- Menu lateral recolhível no desktop, com preferência salva por conta neste navegador.
- Modo foco durante as questões. No Mobile, é ativado automaticamente ao iniciar, retomar, resolver uma questão isolada ou revisar erros. O botão Sair pausa a sessão e volta ao início, permitindo retomá-la; a saída nativa da tela cheia preserva o layout de foco enquanto estiver estudando. No desktop, o foco permanece opcional: o botão superior solicita tela cheia e Sair do foco/Esc retorna à questão com o layout normal. O celular mantém contador compacto, troca de tema, saída, aviso temporário de visitante e controles inferiores reservados. Seleção, alternativas riscadas e posição de leitura são preservadas nos redesenhos da mesma questão. Ao concluir, o resultado usa a interface normal. A tela cheia nativa é solicitada nos navegadores compatíveis; sua recusa não impede o layout sem menus.
- Sessão desktop fora da tela cheia usa a altura útil da janela; controles permanecem visíveis e textos extensos rolam dentro do cartão. A posição é mantida na mesma questão e reinicia ao avançar.
- Foco Desktop com coluna central de leitura de até 960 px, enunciado em destaque e alternativas com altura natural. Ações ficam fora da rolagem; selecionar, favoritar, riscar e trocar o tema preservam a leitura. Anterior e Próxima navegam uma questão por vez, com ou sem resposta, sem gerar acerto/erro. Registrar resposta ocupa o centro, mantém a questão atual e impede registrar novamente a mesma tentativa. No Desktop, ← volta, → avança, Enter registra e, após o registro, avança uma questão; depois de registrar pelo teclado, o foco passa para Próxima. T risca/restaura a alternativa selecionada sem gravar progresso. A tecla C seleciona a alternativa C normalmente, assim como 3 ou o mouse. Sem seleção, T não altera a questão. Os novos atalhos não alteram o Mobile. Na última questão, Enter não conclui automaticamente a sessão; os atalhos de setas ignoram campos, controles com navegação própria, modais, composição, modificadores e repetições. Espaço mantém seu comportamento nativo. Seleções ainda não registradas são mantidas em memória ao navegar/pausar, mas não sobrevivem à recarga. As respostas registradas continuam salvas. Concluir sessão é uma ação separada, disponível na última questão, com aviso quando houver não respondidas; o simulado só publica o desempenho ao concluir.
- No Mobile, somente o conteúdo da questão possui rolagem; botões de resposta e estatísticas permanecem ancorados no rodapé, em espaço reservado sem sobreposição. A altura acompanha a área útil do navegador e respeita a safe area do iPhone. Selecionar, favoritar e alternar o tema preservam a posição de leitura.
- No Mobile, disciplina, dificuldade, tag de origem e ações de favorito/revisão ocupam uma linha fixa abaixo do progresso, fora do cartão e da rolagem. Nomes longos usam reticências; os botões mantêm área de toque de 44 px. Assunto, tópico, código e selo Adaptada deixam o cabeçalho Mobile; a procedência completa continua no comentário e o desktop mantém o painel anterior.
- Entrada compacta e início com ação principal de estudo, meta diária, atalhos e bancos; layout dedicado ao celular.
- Importação e exportação de bancos JSON; ativação, desativação e remoção.
- Sessões recomendadas, aleatórias, não respondidas, erros, favoritas, revisão, filtros por assunto e simulados.
- Configuração da sessão com bancos apresentados pelos mesmos títulos e subtítulos dos cards, seleção visual, filtros de conteúdo recolhíveis e resumo da quantidade efetiva. O botão de início e o resumo permanecem visíveis enquanto o conteúdo do painel rola; disciplina, assunto e tópico acompanham os bancos selecionados.
- Tesoura discreta para riscar/restaurar alternativas: no Mobile, sempre visível após a letra, com área de toque de 44 px; no Desktop, aparece por hover ou foco no recuo externo à esquerda do bloco destacado, com um pequeno tracejado indicando o corte. O cursor pode entrar diretamente na pequena área externa do botão (40 × 32 px), mesmo com o ícone oculto, sem precisar passar antes sobre a alternativa. Não reserva espaço dentro da alternativa nem desloca sua letra ou texto. A área de rolagem inclui o botão externo; blocos e enunciado mantêm o alinhamento. O Mobile não utiliza mais gestos de arrastar. Marcação somente visual e temporária, preservada ao trocar tema ou modo foco, sem selecionar, responder ou sincronizar progresso; reinicia ao mudar de questão ou sessão.
- Feedback com resposta selecionada, alternativa correta, comentário e referência. Comentários por alternativa recebem parágrafos separados e letras em negrito, no Mobile, Desktop e resultado do simulado; a apresentação também vale para bancos já importados, sem modificar seu conteúdo ou progresso. Referências ambíguas (como o artigo em “A acumulação”) permanecem como texto comum.
- Favoritos, revisão espaçada, estatísticas por disciplina/assunto/tópico e histórico.
- Minhas sessões com abas Em andamento e Concluídas, filtros por banco/lei e tipo, e paginação de todo o histórico. Retome qualquer estudo ou simulado sem encerrar os demais; consulte resultados antigos sem alterar a sessão ativa ou registrar novas tentativas.
- Desempenho geral ou filtrado por banco/lei, incluindo estatísticas, evolução semanal e agrupamentos por conteúdo.
- Filtros de banco mostram os bancos atuais, inclusive desativados, e os removidos que ainda possuem sessões consultáveis ou respostas na etapa atual do progresso. Importações antigas sem estudo ficam ocultas, sem apagar registros.
- Progresso local automático; exportação e restauração de JSON sem substituir o histórico.
- Sincronização Google Drive com OAuth, união de eventos e um único JSON de progresso por conta e pasta, atualizado com controle de versão e migração automática dos lotes antigos.
- Pasta recuperada pela conta Google em outros dispositivos, via configuração privada no Drive.
- Bancos do sistema disponíveis sem login ou Drive: Lei nº 8.112/1990 (126 questões) e Lei nº 8.069/1990 (73 questões). Bancos pessoais continuam importáveis e podem ser renomeados livremente. Tags Sistema/Pessoal acompanham questões, sessões e resultados; o Desempenho filtra também por origem. Envie bancos nativos em `public/data/question-banks/lei-NUMERO.json` pelo GitHub: o catálogo e as revisões são gerados automaticamente no build. Não requer Blob nem administração pelo aplicativo. Consulte [BANCOS_SISTEMA.md](docs/BANCOS_SISTEMA.md).

## Executar

Requer Node.js 22 ou superior:

```sh
npm ci
npm test
npm run check
npm run build
npm run dev
```

Abra `http://localhost:5173`. Não abra o HTML pelo protocolo `file://`: os módulos e o carregamento do banco dependem de HTTP. O catálogo dos bancos é gerado automaticamente a partir de `public/data/question-banks/`. Para outro servidor, publique o conteúdo de `dist/`.

## Tela cheia no celular

A ocultação das barras do navegador depende do suporte à Fullscreen API. O site não consegue forçar essa permissão. No iPhone, abra o site no Safari, use Compartilhar → Adicionar à Tela de Início e, quando disponível, mantenha Abrir como App da Web ativado. Abra pelo novo ícone e inicie ou retome uma sessão; no Mobile, o foco é automático. O botão de ajuda no foco explica esse procedimento. No Android, também é possível usar Instalar app ou Adicionar à tela inicial quando o navegador oferecer essa opção.

O manifesto e os ícones locais permitem o acesso independente em modo `standalone`; não há service worker nem promessa de funcionamento offline. Entre com a mesma conta Google e conecte o Drive para recuperar os estudos nesse acesso, que pode ter armazenamento separado do navegador. O visitante continua temporário. As áreas seguras do dispositivo são respeitadas; o app não controla gestos ou avisos do sistema.

## Estrutura

```text
src/                    módulos de aplicação, domínio, armazenamento e Drive
public/                 HTML, CSS e identidade visual
docs/                   JSON Schema, modelo e guias
tests/                  testes de domínio, armazenamento e integração simulada
scripts/                build e verificações sem dependências
.github/workflows/      verificações automáticas e publicação manual em GitHub Pages
.openai/hosting.json     identidade e configuração de Sites
```

O build copia `public/`, os módulos de `src/` e `docs/` para `dist/`. Bancos usados apenas em testes ficam em `tests/fixtures/` e não são publicados. Os bancos nativos vêm exclusivamente de `public/data/question-banks/`. O conteúdo é implantável como site estático. Não contém credenciais ou tokens. As funções em `api/auth/` e sua implementação em `server/` são publicadas separadamente pelo Vercel e nunca entram no build público.

## Questões

Veja o [guia didático de formato JSON](public/formato-json.html) ou a [referência técnica](docs/FORMATO_JSON.md), utilize [modelo-banco.json](docs/modelo-banco.json) e valide com [questions.schema.json](docs/questions.schema.json). A importação também verifica IDs repetidos, alternativas repetidas e existência da alternativa correta — relações que o JSON Schema sozinho não garante.

## Progresso e revisão

O histórico é um conjunto de eventos identificados por UUID. Eventos de resposta incluem ID composto do banco/questão, tentativa, alternativa escolhida, gabarito, resultado, data, sessão e classificação do conteúdo. O progresso derivado fornece tentativas, acertos, erros, última resposta, prazo da próxima revisão, favoritos, marcações e estatísticas.

Cada evento local ocupa uma chave independente no `localStorage`, evitando que duas abas reescrevam um documento inteiro. A exportação contém um JSON completo com eventos, resumo e desempenho. Restaurar une eventos pelo ID: duplicatas idênticas não contam duas vezes, independentemente da ordem dos campos JSON. Versões válidas com o mesmo ID e conteúdo diferente são reconciliadas automaticamente; os originais ficam em registros de recuperação incluídos na exportação e no Drive, sem duplicar tentativas. Veja a política em [GOOGLE_DRIVE.md](docs/GOOGLE_DRIVE.md#reconciliação-automática--1102).

Após erro, a questão vence em 1 dia. Após acertos consecutivos, os intervalos são 1, 3, 7, 14, 30 e 60 dias. Questões recentes já acertadas têm peso menor no sorteio recomendado. A fila não repete questões na mesma sessão. “Revisar erros” considera a última tentativa: ao acertar, a questão sai desse modo, mas os erros anteriores permanecem nas estatísticas. As questões marcadas continuam disponíveis até a marcação ser retirada.

No simulado, as escolhas são salvas como rascunho de sessão; eventos de desempenho são emitidos ao concluir, e o gabarito é apresentado somente então. Questões puladas não são computadas como respostas erradas. O aproveitamento final usa todas as questões, portanto as puladas reduzem esse percentual. A taxa geral de acertos usa apenas tentativas efetivamente respondidas.

**Minhas sessões** pode ser aberta no início, em Estudar ou em Desempenho; no desktop, também aparece no menu lateral. Cada sessão conserva sua fila, posição e respostas registradas, mesmo ao iniciar outra sessão de outra lei. Seleções ainda não registradas ficam somente em memória. Sessões mistas aparecem no filtro de qualquer banco que componha a fila. Os resultados concluídos usam o gabarito registrado e, quando disponível no histórico, a versão do banco da época da resposta. Atualizar ou remover um banco não recalcula a nota; conteúdo indisponível é sinalizado, e a retomada depende de reimportar o banco com os mesmos IDs. Consultar um resultado não muda a sessão ativa. Revisar seus erros inicia uma nova sessão por ação explícita.

O filtro de Desempenho apenas restringe a consulta; não divide nem modifica o diário de progresso. Sessões e simulados utilizam o mesmo arquivo principal do Drive, com isolamento por conta. No modo visitante, todo esse histórico continua temporário. Zerar progresso reinicia os estudos de todos os bancos, inclusive sessões e simulados, mesmo com um filtro selecionado.

## Login e usuários

O acesso com conta usa Google. Também há modo visitante sem login: questões importadas, respostas e estatísticas ficam apenas na memória da sessão; não são migradas automaticamente ao entrar com uma conta. Cada conta usa um perfil independente, identificado pelo `sub` verificado no endpoint Google UserInfo. Preferências, progresso local e cache são separados por conta. O cliente OAuth público do projeto `foco-estudos-ecm` está configurado em `public/app-config.json`; veja [LOGIN_GOOGLE.md](docs/LOGIN_GOOGLE.md). O responsável informou ter atualizado o Google Auth; o status atual de publicação/verificação no Console não foi confirmado nesta atualização. Os estudantes não precisam configurar clientes próprios.

## Google Drive

O projeto implementa acesso direto às APIs oficiais do Google. No redirecionamento, funções Vercel trocam o código OAuth com PKCE e confirmam o perfil. Cookies HttpOnly criptografados de curta duração fazem a transição; o token de acesso fica em memória. Na produção Vercel, o acesso offline permite renová-lo automaticamente antes de expirar. A credencial de renovação fica somente em cookie cifrado HttpOnly/Secure/SameSite=Lax por até 30 dias, renovados quando utilizado. Não há banco central de autenticação. Sair limpa esse cookie. O segredo OAuth pertence somente ao ambiente do servidor. O modelo de janela Google permanece disponível sem esse segredo nas hospedagens estáticas. Cada conta escolhe sua própria pasta do Meu Drive. Após validar e conectar, o ID é salvo na área privada `appDataFolder` dessa conta. Ao entrar em outro dispositivo com a mesma conta, a configuração é recuperada antes da sincronização do progresso. Novas contas sem configuração remota começam sem pasta.

**Configuração da instalação:** o cliente OAuth do Foco foi criado com a origem do site publicado. Em outras hospedagens, o responsável precisa autorizar a nova origem no Google Cloud. Cada usuário entra com Google e informa sua pasta uma vez. O escopo adicional `https://www.googleapis.com/auth/drive.appdata` deve constar em Google Auth Platform → Acesso a dados. Usuários existentes precisam conceder essa nova permissão e conectar a pasta ao menos uma vez para migrar a configuração local. A conexão do Drive usada por esta conversa não disponibiliza credenciais automaticamente ao site. Leia [GOOGLE_DRIVE.md](docs/GOOGLE_DRIVE.md). Após abrir/recarregar, entre com Google. A autorização adicional do Drive é solicitada quando necessária; a carga remota acontece antes do primeiro envio.

A partir da versão 1.7.0, o Drive mantém `foco-progresso-<sub>-principal.json`, com todos os eventos da conta na pasta escolhida. O sistema une o histórico remoto ao local antes de atualizar o mesmo ID. Usa o ETag da API Drive v2 e `If-Match` para impedir sobrescritas concorrentes; conflitos de versão são relidos e unidos. A listagem, criação e leitura de conteúdo continuam na API v3. Uma consulta de versão evita baixar o JSON quando ele não mudou e os registros já estão neste navegador.

Na primeira conexão após a atualização, os lotes antigos são validados e consolidados. Somente após conferir o conteúdo remoto, os arquivos incorporados são movidos para a lixeira do Drive, com verificação da versão de cada origem. Bancos de questões e arquivos de outras contas permanecem intactos. Uma falha mantém os dados locais e permite retomar a migração. Criações simultâneas de dois arquivos principais são reconciliadas, preservando a união dos eventos. A exportação continua disponível como cópia independente.

## Publicação e GitHub

Este projeto está preparado para Sites, Vercel e GitHub Pages. A hospedagem da tela de login é acessível por URL, enquanto cada visitante autoriza somente seus próprios dados Google. Veja [DEPLOY.md](docs/DEPLOY.md).

O repositório deste sistema é [evertoncmartins/foco-concurso](https://github.com/evertoncmartins/foco-concurso), na branch `main`. O usuário autorizou o envio das próximas atualizações para esse destino. O checkout de Sites conserva seu versionamento administrado pela plataforma; o remoto adicional `github` aponta para o repositório do usuário.

O workflow `ci.yml` executa testes, verificação de sintaxe e build a cada push em `main` e em pull requests. A publicação por GitHub Pages é opcional: o workflow `pages.yml` só é iniciado manualmente, após configurar Pages. O endereço de produção informado pelo responsável é [Foco no Vercel](https://foco-concurso-wine.vercel.app/). A publicação administrada por Sites permanece como espelho técnico. A configuração Vercel usa `dist/` e executa testes antes do build; ao conectar um repositório, a integração Git do Vercel realiza deploys automáticos.

## Segurança e limites

- Tokens não ficam em URL, arquivo, `localStorage` ou código versionado.
- Dados importados são tratados como texto; HTML e URLs não HTTPS são rejeitados/escapados.
- O Drive só é acessado após autorização explícita. O navegador não ganha acesso por receber um link público de pasta.
- O escopo Drive é amplo porque a plataforma lê bancos existentes na pasta escolhida, cria e atualiza o progresso e move lotes já incorporados para a lixeira. Uso pessoal requer a conta autorizada no projeto OAuth; uso público exige cumprir a política de verificação do Google. Uma evolução com Google Picker permite restringir o escopo a arquivos escolhidos.
- Os arquivos criados herdam o compartilhamento da pasta. Uma pasta acessível por link pode expor o histórico a quem tiver acesso ao arquivo. Use uma pasta privada para histórico pessoal; o sistema não altera permissões do Drive.
- Até 5.000 questões por banco, 100.000 eventos por documento e 10.000 arquivos por busca. Os conteúdos textuais não têm limite de caracteres e os arquivos JSON não têm o antigo limite de 10 MB, inclusive no Drive. IDs continuam limitados a 120 caracteres. A capacidade real depende da memória e da cota do navegador, da conexão e do Drive. Exportar e manter o Drive sincronizado reduz dependência do dispositivo.
- Funciona sem conexão com o Drive. A produção Vercel renova o acesso durante o uso, preservando a sessão de estudo e enviando as alterações pendentes. Não sincroniza quando fechada. Revogação, expiração da credencial de renovação ou hospedagem estática sem o backend exigem nova autorização manual; o progresso local permanece salvo.
- Histórico local é separado por conta e não é criptografado. Use seu perfil pessoal do navegador.

## Verificação

`npm test` verifica importação, gabaritos, sorteios, filtros, revisão, favoritos, estatísticas, recarga, união de históricos, idempotência, persistência de sessões e falhas/repetições do adaptador Drive com respostas HTTP simuladas. Testes simulados não comprovam consentimento OAuth nem escrita real do site no Google Drive. O relatório em [VERIFICACAO.md](docs/VERIFICACAO.md) distingue testes executados das etapas que dependem de integração e navegador.
