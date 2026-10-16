# Revisão do feedback nativo — 16/10/2026

A versão 1.20.0 revisa somente o conteúdo explicativo dos JSONs oficiais do repositório.

| Arquivo | Questões | Alternativas com análise individual | Cobertura |
|---|---:|---:|---:|
| `public/data/question-banks/lei-8112.json` | 126 | 553 | 100% |
| `public/data/question-banks/lei-8069.json` | 73 | 348 | 100% |
| Total | 199 | 901 | 100% |

Todas as questões têm explicação geral, `optionExplanations` por letra, fundamentação com dispositivos e referência oficial. A comparação com a versão 1.19.1 confirmou preservação de IDs, enunciados, alternativas, gabaritos, dificuldade, tags, origem, ano, cargo, banca e dados da prova. Além dos comentários, foram complementados 30 fundamentos legais e a referência constitucional de uma questão. Nenhum banco pessoal ou arquivo do Drive foi editado. A identidade usada na associação de progresso não mudou.

A validação do catálogo bloqueia novos bancos sem o perfil completo do schema único. O modelo para download, o guia e o importador usam os mesmos campos; o exemplo do HTML é gerado diretamente de `docs/modelo-banco.json`. Arquivos pessoais antigos continuam aceitos. O novo feedback é exibido em sessões históricas nativas somente quando o núcleo da questão é idêntico, sem regravar respostas nem notas.

## Ressalvas de redação preservadas e explicitadas

Esta revisão não substitui a verificação documental da situação final de gabaritos históricos. As condições de confirmação já registradas em `fonte` foram mantidas. Não foram inventados erros jurídicos para sustentar distratores ambíguos:

- `lei8112-qconcursos-q1641303`: a condição de acionista não autoriza gerência privada. A leitura da alternativa D é ambígua; o feedback explica a ressalva e identifica B como gabarito da fonte.
- `eca-qconcursos-q715522`: A e B podem expressar conteúdo materialmente verdadeiro; o comentário distingue a enumeração completa em D sem negar esses direitos.
- `eca-qconcursos-q1059196`: a matrícula é uma garantia real; A corresponde à formulação completa do direito dos pais/responsáveis cobrado pela fonte.
- `eca-qconcursos-q416487`: a afirmação sobre gratuidade até o ensino fundamental só é falsa se lida como teto. O comentário explicita essa leitura restritiva.
- `lei8112-qconcursos-q1027456` e `lei8112-qconcursos-q2055025`: o comentário distingue reprodução literal de equivalência conceitual, sem ensinar diferenças inexistentes entre palavras próximas.

Em `eca-qconcursos-q673617`, foi corrigido um erro do comentário anterior: a alternativa E já usava corretamente a faixa da adolescência. A análise agora aponta os erros efetivos, no início da infância e na idade da aplicação excepcional.

## Fontes legais oficiais

- [Lei nº 8.112/1990 — texto compilado](https://www.planalto.gov.br/ccivil_03/leis/l8112compilado.htm).
- [Lei nº 8.069/1990 — texto compilado](https://www.planalto.gov.br/ccivil_03/leis/l8069compilado.htm).
- [Constituição Federal](https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm), especialmente arts. 39, 41, 169 e 208.
- [Decreto nº 12.374/2025](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12374.htm) e [Decreto nº 12.967/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12967.htm).
- [Lei nº 15.240/2025](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15240.htm), [Lei nº 15.413/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15413.htm) e [Lei nº 15.512/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15512.htm).
