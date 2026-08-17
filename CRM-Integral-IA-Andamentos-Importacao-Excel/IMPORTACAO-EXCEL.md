# Importação de clientes por Excel

O CRM reconhece diretamente o formato da planilha **Dados Documental GTB.xlsx**.

## Colunas reconhecidas
CodigoProcesso, Requerente, Contato, EstadoCivil, Tipo, Contrato, Procuracao, Requerimento, Distrato, DocumentoFaltante, InformacaoFaltante, Observacao e Situacao.

## Município e Estado são preenchidos automaticamente
A planilha modelo **não** tem colunas de Município/Estado — o CRM descobre esses dados sozinho a partir do **prefixo do Código do Processo** (a parte antes do `_`, ex.: `GTB01` em `GTB01_0386`, `AGM02` em `AGM02_0078`).

Pré-requisito: cada Projeto/NUI cadastrado em **Projetos** precisa ter o campo **Sigla / Prefixo do processo** preenchido com esse mesmo prefixo. Uma vez cadastrado, toda importação futura preenche `projeto_id`, `município`, `estado` e `núcleo` linha a linha, mesmo que a planilha misture prefixos de projetos diferentes.

Se o prefixo de uma linha não tiver projeto cadastrado com aquela sigla, o CRM usa como reserva o Projeto/NUI selecionado manualmente no passo 2 da importação (ou deixa em branco, se nenhum for escolhido). A prévia mostra a coluna **Município/UF detectado** por linha antes de confirmar, e o resumo final lista os prefixos que ficaram sem correspondência.

## Como funciona
1. Em **Projetos**, garanta que cada Projeto/NUI tenha a **Sigla** preenchida (ex.: GTB01, AGM02).
2. Entre em **Clientes cadastrados** e clique em **Importar Excel**.
3. Selecione o arquivo .xlsx, .xls ou .csv.
4. (Opcional) Escolha um Projeto/NUI de reserva para prefixos não reconhecidos, ou deixe **Sem NUI — vincular depois**.
5. Confira a prévia, incluindo o Município/UF detectado por linha.
6. Escolha se deseja criar/atualizar por Código do Processo ou somente inserir novos.
7. Execute a importação.

O campo CodigoProcesso é usado como identificador principal de duplicidade.
