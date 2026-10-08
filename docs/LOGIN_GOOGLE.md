# Login Google e contas individuais

## O que mudou

O Foco agora abre em uma tela de entrada. Não existe cadastro com senha: o usuário escolhe a conta Google e autoriza o acesso ao perfil. A identidade é obtida diretamente no endpoint HTTPS `https://openidconnect.googleapis.com/v1/userinfo`, com token temporário no cabeçalho Authorization. O sistema não confia em dados de perfil digitados nem em JWT apenas decodificado.

O identificador permanente é o `sub` devolvido pelo Google, não o e-mail. Respostas, favoritos, revisões, sessões, bancos, meta e pasta escolhida são separados por esse identificador. Uma troca de e-mail na mesma conta não cria um novo histórico.

## Configuração única do responsável

Os estudantes **não precisam criar clientes OAuth próprios**. A plataforma usa um único cliente público OAuth do tipo Aplicativo da Web.

1. No Google Cloud, crie/selecione o projeto do Foco e ative a Google Drive API.
2. Configure o Google Auth Platform para público externo. Configure nome e suporte e os escopos de perfil (`openid`, `userinfo.email`, `userinfo.profile`) e Drive (`https://www.googleapis.com/auth/drive`).
3. Se a aplicação estiver em teste, adicione as contas que poderão utilizá-la como usuários de teste. Para liberar amplamente, cumpra os requisitos de publicação/verificação do Google, especialmente pelo escopo Drive.
4. Crie um cliente OAuth do tipo Aplicativo da Web.
5. Em Origens JavaScript autorizadas, adicione exatamente `https://foco-concursos.ecmdigital.chatgpt.site`. Para desenvolvimento, adicione `http://localhost:5173`.
6. Configure `googleClientId` em `public/app-config.json` com o ID terminado em `.apps.googleusercontent.com`, ou configure a variável de build `PUBLIC_GOOGLE_CLIENT_ID`.
7. Gere e publique o build. O ID é público e não é uma senha. Não configure client secret no frontend.

O cliente Google ainda não foi fornecido nesta atualização. Sem ele, a tela indica que o login aguarda configuração e não simula uma entrada. A opção “Configuração do responsável” permite validar um ID nesse navegador; ela não configura os demais visitantes. Para disponibilizar a todos, o ID precisa estar no build publicado.

## Fluxo do usuário

1. Abrir Foco → Continuar com Google.
2. Escolher sua conta e autorizar o perfil.
3. Na primeira entrada, informar o link de uma pasta do seu **Meu Drive**, ou escolher estudar localmente por enquanto.
4. Autorizar o acesso ao Drive. O perfil é conferido novamente: escolher outra conta nesse passo é recusado.
5. A aplicação valida a pasta e a permissão para adicionar arquivos, recupera o progresso desse usuário e importa novos bancos JSON disponíveis.
6. Estudar. O salvamento local é imediato e o Drive recebe lotes imutáveis de alterações.
7. Sair encerra a sessão em memória e retira os dados da tela; a cópia local daquela conta continua preservada para a próxima entrada.

Após recarregar, é necessário entrar novamente. Não há tokens persistidos. Se o Google já concedeu o escopo Drive e a pasta já está configurada, a autorização retornada no login é reutilizada para recuperar o histórico. Caso contrário, a autorização adicional ocorre pelo botão da pasta.

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
