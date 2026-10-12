# Foco — Estudos para concursos

Plataforma para resolver questões e estudar para qualquer concurso com seus próprios bancos JSON. HTML5, CSS3 e JavaScript em módulos ES, sem dependências de produção e sem banco de dados tradicional.

## Funcionalidades

- Tema claro com botões e destaques em azul profundo (#00001F), escuro em cinza neutro e automático; detalhes discretos em azul, violeta, âmbar e rosa nos dois temas; navegação adaptada para celulares.
- Login com Google ou acesso como visitante. No Vercel, o login pode redirecionar na mesma aba e retornar automaticamente, usando código OAuth e PKCE. A ativação requer configuração do servidor e do endereço de retorno no Google. Até a ativação e em hospedagens estáticas, o acesso usa a janela Google preparada antes do clique. No modo visitante, dados ficam apenas em memória e são descartados ao sair/recarregar.
- Política de Privacidade pública, acessível sem login em `privacidade.html`, com link na entrada e em Ajustes.
- Termos de Serviço públicos em `termos.html`, com links na entrada, em Ajustes e na Política de Privacidade.
- Restauração inicial do Drive bloqueia o estudo até concluir, com progresso por etapas e contagem de arquivos; erros e autorização ausente têm recuperação explícita.
- Menu lateral recolhível no desktop, com preferência salva por conta neste navegador.
- Modo foco durante as questões. No Mobile, é ativado automaticamente ao iniciar, retomar, resolver uma questão isolada ou revisar erros. O botão Sair pausa a sessão e volta ao início, permitindo retomá-la; a saída nativa da tela cheia preserva o layout de foco enquanto estiver estudando. No desktop, o foco permanece opcional: o botão superior solicita tela cheia e Sair do foco/Esc retorna à questão com o layout normal. O celular mantém contador compacto, troca de tema, saída, aviso temporário de visitante e controles inferiores reservados. Seleção, alternativas riscadas e posição de leitura são preservadas nos redesenhos da mesma questão. Ao concluir, o resultado usa a interface normal. A tela cheia nativa é solicitada nos navegadores compatíveis; sua recusa não impede o layout sem menus.
- Sessão desktop fora da tela cheia usa a altura útil da janela; controles permanecem visíveis e textos extensos rolam dentro do cartão. A posição é mantida na mesma questão e reinicia ao avançar.
- Foco Desktop com coluna central de leitura de até 960 px, enunciado em destaque e alternativas com altura natural. Ações ficam fora da rolagem; selecionar, favoritar, riscar e trocar o tema preservam a leitura. Espaço pula uma questão ainda não respondida, com indicação discreta no botão Pular. O atalho ignora campos, editores, controles, modais, composição, modificadores e repetições da tecla; Alt+P continua disponível. O Mobile mantém seu layout e não usa o novo atalho global.
- No Mobile, somente o conteúdo da questão possui rolagem; botões de resposta e estatísticas permanecem ancorados no rodapé, em espaço reservado sem sobreposição. A altura acompanha a área útil do navegador e respeita a safe area do iPhone. Selecionar, favoritar e alternar o tema preservam a posição de leitura.
- No Mobile, disciplina, dificuldade, tag de origem e ações de favorito/revisão ocupam uma linha fixa abaixo do progresso, fora do cartão e da rolagem. Nomes longos usam reticências; os botões mantêm área de toque de 44 px. Assunto, tópico, código e selo Adaptada deixam o cabeçalho Mobile; a procedência completa continua no comentário e o desktop mantém o painel anterior.
- Entrada compacta e início com ação principal de estudo, meta diária, atalhos e bancos; layout dedicado ao celular.
- Importação e exportação de bancos JSON; ativação, desativação e remoção.
- Sessões recomendadas, aleatórias, não respondidas, erros, favoritas, revisão, filtros por assunto e simulados.
- Tesoura discreta após cada letra para riscar/restaurar alternativas, no desktop e no celular. Marcação somente visual e temporária, preservada ao trocar tema ou modo foco, sem selecionar, responder ou sincronizar progresso; reinicia ao mudar de questão ou sessão.
- Feedback com resposta selecionada, alternativa correta, comentário e referência.
- Favoritos, revisão espaçada, estatísticas por disciplina/assunto/tópico e histórico.
- Sessões pausáveis e retomadas após recarregar a página.
- Progresso local automático; exportação e restauração de JSON sem substituir o histórico.
- Sincronização Google Drive com OAuth, união de eventos e um único JSON de progresso por conta e pasta, atualizado com controle de versão e migração automática dos lotes antigos.
- Pasta recuperada pela conta Google em outros dispositivos, via configuração privada no Drive.
- Banco inicial com dez questões autorais sobre a Lei nº 8.112/1990.

## Executar

Requer Node.js 22 ou superior e Python 3 apenas para o servidor de desenvolvimento:

```sh
npm test
npm run check
npm run build
npm run dev
```

Abra `http://localhost:5173`. Não abra o HTML pelo protocolo `file://`: os módulos e o carregamento do banco dependem de HTTP. Nenhum `npm install` é necessário. Para outro servidor, publique o conteúdo de `dist/`.

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

O build copia `public/`, `src/` e `docs/` para `dist/`. O conteúdo é implantável como site estático. Não contém credenciais ou tokens. As funções em `api/auth/` e sua implementação em `server/` são publicadas separadamente pelo Vercel e nunca entram no build público.

## Questões

Leia [FORMATO_JSON.md](docs/FORMATO_JSON.md), utilize [modelo-banco.json](docs/modelo-banco.json) e valide com [questions.schema.json](docs/questions.schema.json). A importação também verifica IDs repetidos, alternativas repetidas e existência da alternativa correta — relações que o JSON Schema sozinho não garante.

## Progresso e revisão

O histórico é um conjunto de eventos identificados por UUID. Eventos de resposta incluem ID composto do banco/questão, tentativa, alternativa escolhida, gabarito, resultado, data, sessão e classificação do conteúdo. O progresso derivado fornece tentativas, acertos, erros, última resposta, prazo da próxima revisão, favoritos, marcações e estatísticas.

Cada evento local ocupa uma chave independente no `localStorage`, evitando que duas abas reescrevam um documento inteiro. A exportação contém um JSON completo com eventos, resumo e desempenho. Restaurar une eventos pelo ID: duplicatas idênticas não contam duas vezes, e IDs com conteúdos diferentes geram erro, preservando os dados.

Após erro, a questão vence em 1 dia. Após acertos consecutivos, os intervalos são 1, 3, 7, 14, 30 e 60 dias. Questões recentes já acertadas têm peso menor no sorteio recomendado. A fila não repete questões na mesma sessão. “Revisar erros” considera a última tentativa: ao acertar, a questão sai desse modo, mas os erros anteriores permanecem nas estatísticas. As questões marcadas continuam disponíveis até a marcação ser retirada.

No simulado, as escolhas são salvas como rascunho de sessão; eventos de desempenho são emitidos ao concluir, e o gabarito é apresentado somente então. Questões puladas não são computadas como respostas erradas. O aproveitamento final usa todas as questões, portanto as puladas reduzem esse percentual. A taxa geral de acertos usa apenas tentativas efetivamente respondidas.

## Login e usuários

O acesso com conta usa Google. Também há modo visitante sem login: questões importadas, respostas e estatísticas ficam apenas na memória da sessão; não são migradas automaticamente ao entrar com uma conta. Cada conta usa um perfil independente, identificado pelo `sub` verificado no endpoint Google UserInfo. Preferências, progresso local e cache são separados por conta. O cliente OAuth público do projeto `foco-estudos-ecm` está configurado em `public/app-config.json`; veja [LOGIN_GOOGLE.md](docs/LOGIN_GOOGLE.md). O responsável informou ter atualizado o Google Auth; o status atual de publicação/verificação no Console não foi confirmado nesta atualização. Os estudantes não precisam configurar clientes próprios.

## Google Drive

O projeto implementa acesso direto às APIs oficiais do Google. No redirecionamento, funções Vercel trocam o código OAuth com PKCE e confirmam o perfil. Cookies HttpOnly criptografados de curta duração fazem a transição; após o retorno, o token fica em memória e expira. Não há banco de autenticação nem tokens de renovação. O segredo OAuth pertence somente ao ambiente do servidor. O modelo de janela Google permanece disponível sem esse segredo nas hospedagens estáticas. Cada conta escolhe sua própria pasta do Meu Drive. Após validar e conectar, o ID é salvo na área privada `appDataFolder` dessa conta. Ao entrar em outro dispositivo com a mesma conta, a configuração é recuperada antes da sincronização do progresso. Novas contas sem configuração remota começam sem pasta.

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
- Até 5.000 questões por banco, arquivo JSON até 10 MB, 100.000 eventos por documento e 10.000 arquivos por busca. O armazenamento local também depende da cota do navegador. Exportar e manter o Drive sincronizado reduz dependência do dispositivo.
- Funciona sem conexão com o Drive. A aplicação não oferece refresh tokens nem sincronização quando fechada; autorizações expiradas precisam de nova ação de conexão.
- Histórico local é separado por conta e não é criptografado. Use seu perfil pessoal do navegador.

## Verificação

`npm test` verifica importação, gabaritos, sorteios, filtros, revisão, favoritos, estatísticas, recarga, união de históricos, idempotência, persistência de sessões e falhas/repetições do adaptador Drive com respostas HTTP simuladas. Testes simulados não comprovam consentimento OAuth nem escrita real do site no Google Drive. O relatório em [VERIFICACAO.md](docs/VERIFICACAO.md) distingue testes executados das etapas que dependem de integração e navegador.
