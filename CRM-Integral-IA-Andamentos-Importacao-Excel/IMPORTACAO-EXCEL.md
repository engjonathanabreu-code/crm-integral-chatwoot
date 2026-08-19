# Importação de clientes por Excel

O CRM reconhece dois modelos de planilha, detectados automaticamente pelas colunas do arquivo.

## Modelo 1 — Dados Documental GTB
CodigoProcesso, Requerente, Contato, EstadoCivil, Tipo, Contrato, Procuracao, Requerimento, Distrato, DocumentoFaltante, InformacaoFaltante, Observacao, Situacao.

## Modelo 2 — Beneficiários / NUI
CodigoProcesso, CodigoNUI, Beneficiarios, Contato, Localizacao, Objeto, Posse, AreaPosse, Situacao.

- **CodigoNUI** preenche o campo Núcleo do cliente diretamente (tem prioridade sobre o núcleo do Projeto vinculado).
- **Beneficiarios** aceita múltiplas pessoas separadas por `;`, cada uma no formato `Nome (CPF 000.000.000-00)`. O CRM separa nome(s) e CPF(s) automaticamente — nomes vão para o campo Nome, CPFs para o novo campo CPF.
- **Localizacao** → campo Endereço.
- **Objeto** → campo Tipo de imóvel.
- **Posse** → campo Tipo de posse.
- **AreaPosse** → campo Área da posse (guardado como texto, pois a planilha usa valores como "Não Informada").
- **Situacao** → campo Situação documental, igual ao modelo Documental GTB.

## Município e Estado são preenchidos automaticamente
Nenhum dos dois modelos tem colunas de Município/Estado — o CRM descobre esses dados sozinho a partir do **prefixo do Código do Processo** (a parte antes do `_`, ex.: `GTB01` em `GTB01_0386`, `AGM02` em `AGM02_0078`, `AGR04` em `AGR04_0001`).

Pré-requisito: cada Projeto/NUI cadastrado em **Projetos** precisa ter o campo **Sigla / Prefixo do processo** preenchido com esse mesmo prefixo. Uma vez cadastrado, toda importação futura preenche `projeto_id`, `município`, `estado` (e, no modelo Documental GTB, o núcleo) linha a linha, mesmo que a planilha misture prefixos de projetos diferentes.

Se o prefixo de uma linha não tiver projeto cadastrado com aquela sigla, o CRM usa como reserva o Projeto/NUI selecionado manualmente no passo 2 da importação (ou deixa em branco, se nenhum for escolhido). A prévia mostra a coluna **Município/UF detectado** por linha antes de confirmar, e o resumo final lista os prefixos que ficaram sem correspondência.

## Como funciona
1. Em **Projetos**, garanta que cada Projeto/NUI tenha a **Sigla** preenchida (ex.: GTB01, AGM02, AGR04).
2. Entre em **Clientes cadastrados** e clique em **Importar Excel**.
3. Selecione o arquivo .xlsx, .xls ou .csv. O CRM identifica sozinho qual dos dois modelos é.
4. (Opcional) Escolha um Projeto/NUI de reserva para prefixos não reconhecidos, ou deixe **Sem NUI — vincular depois**.
5. Confira a prévia, incluindo o Município/UF detectado por linha.
6. Escolha se deseja criar/atualizar por Código do Processo ou somente inserir novos.
7. Execute a importação.

O campo CodigoProcesso é usado como identificador principal de duplicidade.
