# Bancos do sistema e pessoais — 1.17.0

Os arquivos públicos em `public/data/question-banks/` formam o catálogo nativo. `index.json` lista os arquivos `lei-NUMERO.json`. O primeiro catálogo contém 126 questões da Lei nº 8.112/1990 e 73 da Lei nº 8.069/1990, dos bancos já preparados para o Foco. As fontes e os comentários de cada questão foram preservados; Sistema identifica a procedência na plataforma, não uma chancela governamental.

O navegador carrega o catálogo sem login ou Drive. Na produção, `/api/question-banks` fornece o catálogo vigente, combinando os arquivos incluídos no projeto com as atualizações administrativas. Hospedagens estáticas consultam também o catálogo público da produção e conservam o fallback dos arquivos incluídos no build. Não envie o token de armazenamento para `app-config.json`, o build público ou os arquivos de progresso.

## Bancos pessoais e compatibilidade

Eventos de importação existentes continuam pessoais. Os IDs e as questões permanecem associados às respostas, sessões e marcações originais. O evento `bank-metadata` guarda `displayName` separadamente do conteúdo: atualizar ou reimportar o JSON não desfaz o nome escolhido. Renomear altera a apresentação, sem renomear o arquivo físico do Drive. O nome explícito é respeitado em cards, seleção, questões, filtros, histórico e resultados.

O espaço de IDs `lei-NUMERO` fica reservado ao sistema. Uma importação pessoal com esse ID passa a `personal_bank_lei-NUMERO`. Se o ID já existia, o modelo traduz suas referências antigas de forma determinística, sem apagar ou reescrever o diário original. Respostas e sessões novas possuem origem explícita, permitindo que uma questão do sistema e uma pessoal de mesmo número continuem distintas. Outros IDs existentes não são alterados. Arquivos pessoais que declarem `sourceType: system` continuam pessoais.

O Drive mantém o arquivo principal por conta. Bancos pessoais, nomes escolhidos, preferências de ativação, respostas e sessões continuam sincronizados. O catálogo nativo atual não é importado para o Drive. Ao estudar um banco nativo, uma cópia histórica da versão utilizada pode integrar o progresso, para preservar sessões e resultados após atualizações ou remoções. Essa cópia não administra nem substitui o catálogo público. No modo visitante, tudo isso continua temporário.

As questões derivadas e as respostas novas carregam `bankId`, `sourceType` e `displayName`. As sessões guardam a origem de suas questões. Resultados históricos usam gabaritos e conteúdo da época. Bancos nativos retirados do catálogo deixam de ser oferecidos em novas sessões, enquanto sessões já salvas podem consultar sua versão histórica. O reset de progresso preserva bancos e nomes, reiniciando apenas os estudos da conta.

## Administração segura

Somente `ecmdigital@gmail.com`, com e-mail confirmado pelo Google, pode administrar o catálogo. O servidor consulta diretamente o endpoint Google UserInfo com o bearer recebido. E-mail enviado no corpo, sinalizadores locais e botões manipulados não autorizam operações. Todas as gravações exigem POST JSON de mesma origem e verificação da conta. Tokens não são registrados em logs ou expostos no catálogo público.

Em Banco de questões, o administrador recebe Adicionar banco do sistema e Gerenciar nos detalhes. Pode importar JSON, substituir as questões, editar descrição e subtítulo ou retirar um banco do catálogo. IDs existentes permanecem fixos. Um novo banco precisa usar `lei-NUMERO`, e seu nome deve identificar a mesma lei. Usuários comuns podem apenas estudar, exportar e ativar/desativar os nativos em seu próprio perfil; as operações pessoais de excluir e renomear não afetam os nativos.

As atualizações usam armazenamento Blob da plataforma. Cada versão JSON tem endereço imutável. Um manifesto pequeno é atualizado com ETag/`ifMatch`, impedindo sobrescrita concorrente silenciosa. A primeira criação também recusa sobrescrita. Remoções usam tombstones no catálogo, preservando versões históricas. Uma falha entre upload e publicação não torna o novo arquivo parte do catálogo.

### Configuração da produção

1. No projeto Vercel `foco-concurso`, conectar um **Blob público** destinado exclusivamente aos bancos da plataforma.
2. Disponibilizar `BLOB_STORE_ID` com a autenticação OIDC do projeto, ou `BLOB_READ_WRITE_TOKEN` somente no servidor. O SDK suporta ambas as configurações. Não colocar esses valores em variáveis públicas.
3. Publicar novamente para aplicar as variáveis. Entrar com `ecmdigital@gmail.com` no endereço principal e abrir Banco de questões.

Sem o armazenamento configurado, os arquivos nativos incluídos no projeto continuam públicos e funcionais. O administrador pode consultar as opções, mas gravações são bloqueadas com uma mensagem de configuração pendente. Não há simulação de salvamento local de mudanças globais.

**Situação verificada em 16/10/2026:** a integração Vercel encontrou o projeto, mas retornou 403 por falta de acesso à equipe ao tentar criar o Blob e consultar as variáveis. Não foi possível concluir a conexão do armazenamento nesta execução. A API foi testada com armazenamento simulado; uma gravação administrativa real permanece pendente dessa configuração.

## Adicionar arquivos pelo repositório

Adicionar `public/data/question-banks/lei-NUMERO.json` e sua entrada em `index.json`. O servidor descobre os arquivos pelo manifesto; `vercel.json` inclui a pasta nas Functions. O build valida IDs, nomes de arquivo e formato de cada banco antes de copiar os assets. Para alterar uma versão existente, atualizar seu `revision`, `publishedAt` e a versão do manifesto. Não reutilizar IDs de questões para conteúdos diferentes.

## Validação

Os testes cobrem carregamento sem conta, isolamento entre origens, nomes livres, importação com ID reservado, restauração, sessões mistas, gabaritos históricos, retirada de bancos, reset, proteção da API, versão concorrente e mudanças de conta durante a verificação administrativa. Os testes de Google e Blob usam respostas simuladas e não comprovam uma escrita real na conta administradora.
