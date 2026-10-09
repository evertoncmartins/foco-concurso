# Login Google e contas individuais

## O que mudou

O Foco agora abre em uma tela de entrada. Não existe cadastro com senha: o usuário escolhe a conta Google e autoriza o acesso ao perfil. A identidade é obtida diretamente no endpoint HTTPS `https://openidconnect.googleapis.com/v1/userinfo`, com token temporário no cabeçalho Authorization. O sistema não confia em dados de perfil digitados nem em JWT apenas decodificado.

O identificador permanente é o `sub` devolvido pelo Google, não o e-mail. Respostas, favoritos, revisões, sessões, bancos, meta e pasta escolhida são separados por esse identificador. Uma troca de e-mail na mesma conta não cria um novo histórico.

## Configuração única do responsável

Os estudantes **não precisam criar clientes OAuth próprios**. A plataforma usa um único cliente público OAuth do tipo Aplicativo da Web.

1. No Google Cloud, crie/selecione o projeto do Foco e ative a Google Drive API.
2. Configure o Google Auth Platform para público externo. Configure nome e suporte e os escopos de perfil (`openid`, `userinfo.email`, `userinfo.profile`) e Drive (`https://www.googleapis.com/auth/drive`), além de configuração privada (`https://www.googleapis.com/auth/drive.appdata`).
3. Se a aplicação estiver em teste, adicione as contas que poderão utilizá-la como usuários de teste. Para liberar amplamente, cumpra os requisitos de publicação/verificação do Google, especialmente pelo escopo Drive.
4. Crie um cliente OAuth do tipo Aplicativo da Web.
5. Em Origens JavaScript autorizadas, adicione exatamente `https://foco-concurso-wine.vercel.app`. Para desenvolvimento, adicione `http://localhost:5173`.
6. Configure `googleClientId` em `public/app-config.json` com o ID terminado em `.apps.googleusercontent.com`, ou configure a variável de build `PUBLIC_GOOGLE_CLIENT_ID`.
7. Gere e publique o build. O ID é público e não é uma senha. Não configure client secret no frontend.

Em 08/10/2026, o cliente **Foco Web** foi criado no projeto `foco-estudos-ecm`, com a origem `https://foco-concursos.ecmdigital.chatgpt.site`, e seu ID público foi configurado no build da plataforma. Não há redirecionamento cadastrado: esta implementação usa o modelo de token em popup do Google Identity Services.

O aplicativo Google está em **modo de teste**, com público externo e a conta do responsável cadastrada como usuário de teste. Para testar com outras pessoas, adicione suas contas em [Público no Google Cloud](https://console.cloud.google.com/auth/audience?project=foco-estudos-ecm). O site ser acessível por URL não elimina as restrições do aplicativo OAuth. A liberação geral ainda exige cumprir o processo aplicável de publicação/verificação do Google.

O nome salvo na tela de consentimento é **Foco Estudos Concursos**. A Google Drive API está ativada, e os escopos `openid`, `userinfo.email`, `userinfo.profile` e `https://www.googleapis.com/auth/drive` foram confirmados no console. Nenhuma conta de faturamento foi vinculada.

Em **Google Auth Platform → Marca / Branding → Política de Privacidade**, utilize `https://foco-concurso-wine.vercel.app/privacidade.html`. A página é pública e também está vinculada à entrada e aos Ajustes. A publicação dessa página não altera o status de teste nem substitui a verificação do aplicativo OAuth e dos domínios. O contato de privacidade remete ao e-mail de suporte cadastrado no consentimento Google; mantenha esse endereço atualizado no console.

No campo **Termos de Serviço**, utilize `https://foco-concurso-wine.vercel.app/termos.html`. A página pública descreve as condições de estudo, importação, acesso Google, sincronização e responsabilidades, com referência à Política de Privacidade.

A opção “Configuração do responsável” permite validar outro ID nesse navegador; ela não configura os demais visitantes. Se o ID do build estiver vazio em outra instalação, a tela indica que o login aguarda configuração e não simula uma entrada. Consentimento real e sincronização de ponta a ponta ainda precisam ser conferidos pela conta de teste.

## Fluxo do usuário

1. Abrir Foco → Continuar com Google.
2. Escolher sua conta e autorizar o perfil e a configuração privada do aplicativo no Drive.
3. O app procura a configuração privada dessa conta. Se houver pasta salva, recupera o ID automaticamente. Se não houver, informa-se o link de uma pasta do **Meu Drive**, ou escolhe-se estudar localmente por enquanto.
4. Autorizar o acesso ao Drive. O perfil é conferido novamente: escolher outra conta nesse passo é recusado.
5. A aplicação valida a pasta e a permissão para adicionar arquivos, salva o ID na configuração privada e recupera o progresso desse usuário. Novos bancos JSON da pasta são importados automaticamente.
6. Estudar. O salvamento local é imediato e o Drive recebe lotes imutáveis de alterações.
7. Sair encerra a sessão em memória e retira os dados da tela; a cópia local daquela conta continua preservada para a próxima entrada.

Após recarregar, é necessário entrar novamente. Não há tokens persistidos. A configuração da pasta é recuperada com `drive.appdata`, mesmo em um navegador sem histórico local. Se o Google já concedeu o escopo Drive, a autorização retornada no login é reutilizada para recuperar o histórico. Caso contrário, a autorização adicional ocorre pelo botão da pasta.

## Separação dos dados

- Chaves locais ficam sob `foco:user:<sub>:`. Preferências e cache de sincronização seguem a mesma separação.
- JSONs de progresso têm `owner: { "provider": "google", "subject": "<sub>" }` e nome `foco-progresso-<sub>-...json`.
- O app lê somente progresso com o prefixo da conta e confirma que o arquivo pertence à conta Google atual (`ownedByMe`). Dentro do JSON, o proprietário também precisa corresponder.
- A restauração de backup recusa arquivos identificados como de outra conta.
- Bancos de perguntas são conteúdo, não histórico de outra pessoa. Se dois usuários escolhem uma pasta compartilhada, podem importar os mesmos bancos que suas permissões permitem ler, mas suas tentativas permanecem separadas.
- Arquivos JSON novos são importados ao conectar a pasta. Bancos com ID já existente ou removido não são substituídos nem reativados automaticamente; mudanças podem ser importadas manualmente com confirmação.
- O Drive contém tanto respostas quanto os bancos importados, pois os lotes incluem eventos de banco. Exportar um banco produz seu JSON independente.

## Recuperar a versão anterior

O histórico antigo permanece nas chaves locais originais. Ele não é entregue automaticamente à primeira pessoa que entra. A conta original verificada pode recuperar seus estudos pelo botão em Ajustes. A identificação do proprietário original é comparada por hash de e-mail; não é um mecanismo de login e não concede autorização ao Drive. A cópia antiga é mantida após a recuperação.

Arquivos antigos sem identificação de conta não são carregados automaticamente do Drive. Isso evita que escolher uma pasta compartilhada atribua tentativas de outra pessoa ao usuário atual.

## Limites e verificação

O servidor publica somente a aplicação e o banco de exemplo. Não hospeda dados pessoais de usuários, sessões de servidor ou APIs próprias de progresso; a identidade e as permissões de arquivos são verificadas pelas APIs Google. Se futuramente forem adicionadas APIs ou dados pessoais no servidor, será necessária validação de identidade e autorização nesse servidor, não apenas a tela de login.

O cache local não é criptografado. Separação por conta impede mistura no uso normal da interface; não protege contra alguém que controla fisicamente o mesmo perfil do navegador e inspeciona seu armazenamento. Use seu perfil pessoal em dispositivos compartilhados.

As pastas herdam suas próprias permissões do Google Drive. Recomenda-se uma pasta privada. Drives compartilhados institucionais ainda não são suportados porque os arquivos não pertencem individualmente à conta.

Os testes automatizados verificam isolamento entre contas, validação do perfil, recusa de conta diferente, propriedade dos JSONs, cache individual, recuperação e encerramento do adaptador. Login/consentimento reais e a interface em aparelhos dependem da configuração OAuth e de verificação em navegador.

Referências oficiais: [Google OAuth JS](https://developers.google.com/identity/oauth2/web/reference/js-reference), [Google UserInfo e ID estável](https://developers.google.com/identity/openid-connect/reference).

## Janela de login e permissões do navegador — 1.5.6

A biblioteca e o cliente OAuth Google são preparados antes de habilitar “Continuar com Google”. O pedido de autorização abre a janela diretamente no clique, antes de qualquer espera assíncrona. Se o carregamento falhar ou exceder 20 segundos, a entrada informa o problema e oferece “Carregar Google novamente”; carregar novamente não abre o login automaticamente. O acesso visitante continua disponível.

O aplicativo distingue `popup_failed_to_open` (a janela não conseguiu abrir), `popup_closed` (fechamento antes de receber a resposta) e erros desconhecidos. A mensagem antiga que juntava cancelamento e bloqueio foi substituída por instruções específicas. A falha de abertura também mostra instruções do Chrome e Firefox e um link para abrir o endereço publicado diretamente em uma aba. Um novo clique pode repetir a entrada; nenhuma autorização é simulada e nenhuma falha apaga o progresso local.

O site não pode garantir a abertura quando as permissões do navegador, extensões ou políticas da organização impedem a janela. No Chrome, se aparecer o ícone de pop-up bloqueado na barra de endereço, permita pop-ups e redirecionamentos somente para a origem exibida na página (na publicação Vercel: `https://foco-concurso-wine.vercel.app`), e clique novamente em “Continuar com Google”. No Firefox, adicione esse mesmo endereço à lista de exceções da abertura de janelas, em Configurações → Privacidade e Segurança → Permissões. Não é necessário liberar pop-ups para todos os sites. Se a janela abrir e fechar antes do fim, confira a mensagem mostrada na janela Google e conclua o acesso. Funcionar em janela anônima sugere uma diferença do perfil habitual, mas não identifica por si só a causa.

Referências: [Google: acionamento pelo clique no modelo de token](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Google: tipos de erro do popup](https://developers.google.com/identity/oauth2/web/reference/js-reference), [Chrome: permitir pop-ups de um site específico](https://support.google.com/chrome/answer/95472?hl=pt-BR), [Firefox: configurações e exceções de janelas](https://support.mozilla.org/pt-BR/kb/configuracoes-do-bloqueador-de-abertura-de-janelas).

## Atualização 1.2.0 — configuração entre dispositivos

O login solicita `drive.appdata`, um escopo específico para a área privada de configuração de cada usuário. O acesso amplo `drive` continua incremental, somente ao conectar uma pasta. A recusa da permissão de configuração permite entrar e estudar localmente, mas impede sua recuperação automática. A conexão da pasta solicita ambas as permissões necessárias.

No Google Cloud do projeto `foco-estudos-ecm`, declare o escopo `https://www.googleapis.com/auth/drive.appdata` em **Google Auth Platform → Acesso a dados → Adicionar ou remover escopos** e salve. Essa alteração de console não foi realizada nesta atualização. A pendência anterior de publicação/verificação do aplicativo Google permanece independente da publicação do site.

Para migrar uma pasta já salva no navegador, entre novamente e clique **Autorizar minha pasta** em Ajustes (se a autorização retornada não permitir conexão automática). A pasta é validada antes de criar a configuração privada. Em outro dispositivo, entre com a mesma conta; não é necessário colar o link novamente. Caso o Google solicite, autorize o Drive para carregar o progresso.


## Endereço publicado — 1.5.7

O responsável informou a publicação em `https://foco-concurso-wine.vercel.app/`. A ajuda de login utiliza a origem real da página, tanto no endereço a permitir quanto no botão para abrir o Foco em uma aba, sem fixar o domínio de Sites. No Vercel, ambos usam a origem Vercel; novas hospedagens e domínios também acompanham a página. O endereço Vercel é o padrão quando a função de visualização é usada sem contexto de navegador. O cadastro de origens OAuth continua sendo feito no Console Google para cada domínio utilizado.
