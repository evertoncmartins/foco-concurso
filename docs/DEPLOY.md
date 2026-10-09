# Versionamento e publicação

## GitHub

O destino autorizado para este sistema é [evertoncmartins/foco-concurso](https://github.com/evertoncmartins/foco-concurso), na branch `main`. O usuário criou o repositório e autorizou o envio das próximas atualizações para ele em 09/10/2026. A visibilidade existente do repositório é preservada.

O envio pelo plugin GitHub pode registrar uma versão completa com a API de objetos Git, preservando o conteúdo remoto e verificando o commit anterior ao atualizar a branch. Quando houver acesso Git autenticado, use o remoto adicional `github`. Não substitua o repositório administrado por Sites:

```sh
git remote add github https://github.com/evertoncmartins/foco-concurso.git
npm test
npm run check
npm run build
git add .
git commit -m "Atualiza o sistema Foco"
git push github HEAD:main
```

Use autenticação segura pelo plugin, CLI/OAuth ou gerenciador de credenciais; não coloque token na URL. O checkout de Sites conserva seu versionamento administrado pela plataforma. Commits criados pela API do GitHub podem ter SHA diferente do commit de Sites, mesmo quando os arquivos são iguais. Confira o conteúdo da árvore e o resultado do workflow `Verify Foco`.

## GitHub Pages

O workflow `.github/workflows/ci.yml` verifica cada push em `main` e pull request. O workflow `.github/workflows/pages.yml` é uma opção manual: executa teste, verificação e build, faz upload de `dist/` e publica com `actions/deploy-pages`. Para usá-lo, configure **Settings → Pages → Source → GitHub Actions** e execute o workflow manualmente em **Actions**. O site ativo continua hospedado em Sites. O código usa caminhos relativos ao documento, compatíveis com Pages em subdiretório e com domínio próprio. Se o domínio mudar, atualize as origens autorizadas do Google OAuth.

## Vercel

`vercel.json` define build com testes e diretório `dist`. Ao importar um repositório no Vercel, use o preset Other. Cada push em `main` publica a versão de produção; branches podem gerar previews. Não há variáveis secretas para o frontend. Configure `PUBLIC_GOOGLE_CLIENT_ID` no build ou `googleClientId` em `public/app-config.json`. É um ID público compartilhado pela aplicação; autorize a origem Vercel no Google Cloud.

## Sites

`.openai/hosting.json` aponta para `dist/`. O código e o build são versionados pelo fluxo de Sites. A primeira versão nasceu privada. Na atualização de usuários, a tela de entrada é disponibilizada por URL para que as pessoas entrem com Google; nenhum progresso pessoal é publicado no servidor. Não há dependência de connector em tempo de execução: o acesso ao Drive utiliza OAuth próprio, concedido pelo visitante.

## Alterações futuras

1. Altere fontes em `src/`, `public/` e `docs/`.
2. Execute `npm test` e `npm run check`.
3. Execute `npm run build`.
4. Confira os fluxos em navegador desktop e celular.
5. Faça commit e push para o destino confirmado.
6. Verifique a execução do workflow/deploy.

Nunca versione exportações pessoais de progresso, tokens ou credenciais. Não edite diretamente `dist/`: ele é gerado novamente pelo build.
