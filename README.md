# Foco — Estudos para concursos

Plataforma pessoal para resolver questões e preparar concursos de Professor do IFSP e FATEC. HTML5, CSS3 e JavaScript em módulos ES, sem dependências de produção e sem banco de dados tradicional.

## Funcionalidades

- Tema claro com botões e destaques em azul profundo (#00001F), escuro em cinza neutro e automático; detalhes discretos em azul, violeta, âmbar e rosa nos dois temas; navegação adaptada para celulares.
- Login com Google ou acesso como visitante. A biblioteca e o cliente Google são preparados antes de liberar a entrada; a autorização abre diretamente no clique. A falha de abertura oferece instruções para Chrome e Firefox e um link para abrir o Foco em uma aba. Falhas de carga podem ser repetidas; fechamento e bloqueio da janela têm orientações distintas. No modo visitante, dados ficam apenas em memória e são descartados ao sair/recarregar.
- Política de Privacidade pública, acessível sem login em `privacidade.html`, com link na entrada e em Ajustes.
- Termos de Serviço públicos em `termos.html`, com links na entrada, em Ajustes e na Política de Privacidade.
- Restauração inicial do Drive bloqueia o estudo até concluir, com progresso por etapas e contagem de arquivos; erros e autorização ausente têm recuperação explícita.
- Menu lateral recolhível no desktop, com preferência salva por conta neste navegador.
- Modo foco em tela cheia durante as questões: no desktop, ocupa toda a largura e acompanha a altura disponível, com texto e espaçamento proporcionais e rolagem para conteúdos longos; o layout mobile é preservado. Botão no canto superior direito; saída pelo botão ou Esc, sem perder a seleção. Se a tela cheia for recusada ou indisponível, o layout sem menus continua funcionando. Ao pausar ou concluir, a interface normal é restaurada.
- Sessão desktop fora da tela cheia usa a altura útil da janela; controles permanecem visíveis e textos extensos rolam dentro do cartão. A posição é mantida na mesma questão e reinicia ao avançar.
- Entrada compacta e início com ação principal de estudo, meta diária, atalhos e bancos; layout dedicado ao celular.
- Importação e exportação de bancos JSON; ativação, desativação e remoção.
- Sessões recomendadas, aleatórias, não respondidas, erros, favoritas, revisão, filtros por assunto e simulados.
- Feedback com resposta selecionada, alternativa correta, comentário e referência.
- Favoritos, revisão espaçada, estatísticas por disciplina/assunto/tópico e histórico.
- Sessões pausáveis e retomadas após recarregar a página.
- Progresso local automático; exportação e restauração de JSON sem substituir o histórico.
- Sincronização Google Drive com OAuth, união de eventos e arquivos JSON imutáveis.
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

O build copia `public/`, `src/` e `docs/` para `dist/`. O conteúdo é implantável como site estático. Não contém credenciais ou tokens.

## Questões

Leia [FORMATO_JSON.md](docs/FORMATO_JSON.md), utilize [modelo-banco.json](docs/modelo-banco.json) e valide com [questions.schema.json](docs/questions.schema.json). A importação também verifica IDs repetidos, alternativas repetidas e existência da alternativa correta — relações que o JSON Schema sozinho não garante.

## Progresso e revisão

O histórico é um conjunto de eventos identificados por UUID. Eventos de resposta incluem ID composto do banco/questão, tentativa, alternativa escolhida, gabarito, resultado, data, sessão e classificação do conteúdo. O progresso derivado fornece tentativas, acertos, erros, última resposta, prazo da próxima revisão, favoritos, marcações e estatísticas.

Cada evento local ocupa uma chave independente no `localStorage`, evitando que duas abas reescrevam um documento inteiro. A exportação contém um JSON completo com eventos, resumo e desempenho. Restaurar une eventos pelo ID: duplicatas idênticas não contam duas vezes, e IDs com conteúdos diferentes geram erro, preservando os dados.

Após erro, a questão vence em 1 dia. Após acertos consecutivos, os intervalos são 1, 3, 7, 14, 30 e 60 dias. Questões recentes já acertadas têm peso menor no sorteio recomendado. A fila não repete questões na mesma sessão. “Revisar erros” considera a última tentativa: ao acertar, a questão sai desse modo, mas os erros anteriores permanecem nas estatísticas. As questões marcadas continuam disponíveis até a marcação ser retirada.

No simulado, as escolhas são salvas como rascunho de sessão; eventos de desempenho são emitidos ao concluir, e o gabarito é apresentado somente então. Questões puladas não são computadas como respostas erradas. O aproveitamento final usa todas as questões, portanto as puladas reduzem esse percentual. A taxa geral de acertos usa apenas tentativas efetivamente respondidas.

## Login e usuários

O acesso com conta usa Google. Também há modo visitante sem login: questões importadas, respostas e estatísticas ficam apenas na memória da sessão; não são migradas automaticamente ao entrar com uma conta. Cada conta usa um perfil independente, identificado pelo `sub` verificado no endpoint Google UserInfo. Preferências, progresso local e cache são separados por conta. O cliente OAuth público do projeto `foco-estudos-ecm` está configurado em `public/app-config.json`; veja [LOGIN_GOOGLE.md](docs/LOGIN_GOOGLE.md). O aplicativo Google permanece em modo de teste, com acesso às contas cadastradas na lista de usuários de teste. Os estudantes não precisam configurar clientes próprios.

## Google Drive

O projeto implementa acesso direto às APIs oficiais do Google através de Google Identity Services. O token fica somente em memória e expira. Nenhum segredo OAuth é necessário em uma aplicação estática com esse modelo. Cada conta escolhe sua própria pasta do Meu Drive. Após validar e conectar, o ID é salvo na área privada `appDataFolder` dessa conta. Ao entrar em outro dispositivo com a mesma conta, a configuração é recuperada antes da sincronização do progresso. Novas contas sem configuração remota começam sem pasta.

**Configuração da instalação:** o cliente OAuth do Foco foi criado com a origem do site publicado. Em outras hospedagens, o responsável precisa autorizar a nova origem no Google Cloud. Cada usuário entra com Google e informa sua pasta uma vez. O escopo adicional `https://www.googleapis.com/auth/drive.appdata` deve constar em Google Auth Platform → Acesso a dados. Usuários existentes precisam conceder essa nova permissão e conectar a pasta ao menos uma vez para migrar a configuração local. A conexão do Drive usada por esta conversa não disponibiliza credenciais automaticamente ao site. Leia [GOOGLE_DRIVE.md](docs/GOOGLE_DRIVE.md). Após abrir/recarregar, entre com Google. A autorização adicional do Drive é solicitada quando necessária; a carga remota acontece antes do primeiro envio.

Para prevenir sobrescritas concorrentes sem um backend central, o Drive recebe lotes JSON imutáveis `foco-progresso-*.json`, unidos por ID. É uma decisão deliberada em vez de reescrever um único arquivo compartilhado. A exportação produz o arquivo consolidado. Bancos importados e sessões também são sincronizados. Não apague lotes: eles constituem o histórico persistente.

## Publicação e GitHub

Este projeto está preparado para Sites, Vercel e GitHub Pages. A hospedagem da tela de login é acessível por URL, enquanto cada visitante autoriza somente seus próprios dados Google. Veja [DEPLOY.md](docs/DEPLOY.md).

O repositório deste sistema é [evertoncmartins/foco-concurso](https://github.com/evertoncmartins/foco-concurso), na branch `main`. O usuário autorizou o envio das próximas atualizações para esse destino. O checkout de Sites conserva seu versionamento administrado pela plataforma; o remoto adicional `github` aponta para o repositório do usuário.

O workflow `ci.yml` executa testes, verificação de sintaxe e build a cada push em `main` e em pull requests. A publicação por GitHub Pages é opcional: o workflow `pages.yml` só é iniciado manualmente, após configurar Pages. O site ativo continua em [Foco](https://foco-concursos.ecmdigital.chatgpt.site). A configuração Vercel usa `dist/` e executa testes antes do build; ao conectar um repositório, a integração Git do Vercel realiza deploys automáticos.

## Segurança e limites

- Tokens não ficam em URL, arquivo, `localStorage` ou código versionado.
- Dados importados são tratados como texto; HTML e URLs não HTTPS são rejeitados/escapados.
- O Drive só é acessado após autorização explícita. O navegador não ganha acesso por receber um link público de pasta.
- O escopo Drive é amplo porque a plataforma lê bancos existentes em uma pasta escolhida e cria novos arquivos ali. Uso pessoal requer a conta autorizada no projeto OAuth; uso público exige cumprir a política de verificação do Google. Uma evolução com Google Picker permite restringir o escopo a arquivos escolhidos.
- Os arquivos criados herdam o compartilhamento da pasta. Uma pasta acessível por link pode expor o histórico a quem tiver acesso ao arquivo. Use uma pasta privada para histórico pessoal; o sistema não altera permissões do Drive.
- Até 5.000 questões por banco, arquivo JSON até 10 MB, 100.000 eventos por documento e 10.000 arquivos por busca. O armazenamento local também depende da cota do navegador. Exportar e manter o Drive sincronizado reduz dependência do dispositivo.
- Funciona sem conexão com o Drive. A aplicação não oferece refresh tokens nem sincronização quando fechada; autorizações expiradas precisam de nova ação de conexão.
- Histórico local é separado por conta e não é criptografado. Use seu perfil pessoal do navegador.

## Verificação

`npm test` verifica importação, gabaritos, sorteios, filtros, revisão, favoritos, estatísticas, recarga, união de históricos, idempotência, persistência de sessões e falhas/repetições do adaptador Drive com respostas HTTP simuladas. Testes simulados não comprovam consentimento OAuth nem escrita real do site no Google Drive. O relatório em [VERIFICACAO.md](docs/VERIFICACAO.md) distingue testes executados das etapas que dependem de integração e navegador.
