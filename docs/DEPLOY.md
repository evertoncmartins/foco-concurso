# Versionamento e publicação

## GitHub

A integração GitHub foi dispensada nesta tarefa. Nenhum repositório GitHub foi criado, verificado ou recebido como destino. Antes de criar um, procure por `foco-concursos`, `QConcursos IA` ou nomes usados anteriormente na sua conta.

Quando o destino estiver confirmado, associe este checkout ao repositório. Não substitua o remoto de Sites; use um segundo remoto chamado `github`:

```sh
git remote add github https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
npm test
npm run check
npm run build
git add .
git commit -m "feat: plataforma de estudo e revisão"
git push github HEAD:main
```

Use autenticação segura por CLI/OAuth ou gerenciador de credenciais; não coloque token na URL. O checkout de Sites já possui seu próprio commit e remoto administrado pela plataforma.

## GitHub Pages

O workflow `.github/workflows/pages.yml` executa teste, verificação e build; faz upload de `dist/` e publica com `actions/deploy-pages`. Configure **Settings → Pages → Source → GitHub Actions**. O código usa caminhos relativos ao documento, compatíveis com Pages em subdiretório e com domínio próprio. Se o domínio mudar, atualize as origens autorizadas do Google OAuth.

## Vercel

`vercel.json` define build com testes e diretório `dist`. Ao importar um repositório no Vercel, use o preset Other. Cada push em `main` publica a versão de produção; branches podem gerar previews. Não há variáveis secretas para o frontend. O OAuth client ID configurado em Ajustes é público e fica no navegador do usuário; configure a origem Vercel no Google Cloud.

## Sites

`.openai/hosting.json` aponta para `dist/`. O código e o build são versionados pelo fluxo de Sites. O site nasce privado e mantém esse acesso. Não há dependência de connector em tempo de execução: o acesso ao Drive utiliza OAuth próprio, concedido pelo visitante.

## Alterações futuras

1. Altere fontes em `src/`, `public/` e `docs/`.
2. Execute `npm test` e `npm run check`.
3. Execute `npm run build`.
4. Confira os fluxos em navegador desktop e celular.
5. Faça commit e push para o destino confirmado.
6. Verifique a execução do workflow/deploy.

Nunca versione exportações pessoais de progresso, tokens ou credenciais. Não edite diretamente `dist/`: ele é gerado novamente pelo build.
