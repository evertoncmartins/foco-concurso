# Foco — destino autorizado

- O usuário definiu `https://github.com/evertoncmartins/foco-concurso.git` como repositório deste sistema em 09/10/2026 e autorizou o envio das próximas atualizações para ele.
- Envie as alterações concluídas para `evertoncmartins/foco-concurso`, na branch `main`, usando o plugin GitHub quando disponível. Preserve alterações remotas e confira a branch antes de atualizar; não force push.
- Quando houver acesso Git autenticado, utilize o remoto `github`. Não substitua o repositório administrado por Sites nem altere `.openai/hosting.json` para apontar ao GitHub.
- Registre o mesmo código nos destinos de versionamento usados pela tarefa. Quando alterar o site, publique também pelo fluxo de Sites, mantendo o endereço e a audiência existentes.
- Execute `npm test`, `npm run check` e `npm run build` antes de enviar alterações de código. GitHub Actions executa essas verificações automaticamente.
- GitHub Pages é opcional e manual. O site ativo continua em `https://foco-concursos.ecmdigital.chatgpt.site`.
- Não versione progresso pessoal, tokens ou credenciais. `dist/` é gerado pelo build e não deve ser versionado.
