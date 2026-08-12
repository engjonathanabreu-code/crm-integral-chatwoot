# Importação de clientes por Excel

O CRM reconhece diretamente o formato da planilha **Dados Documental GTB.xlsx**.

## Colunas reconhecidas
CodigoProcesso, Requerente, Contato, EstadoCivil, Tipo, Contrato, Procuracao, Requerimento, Distrato, DocumentoFaltante, InformacaoFaltante, Observacao e Situacao.

## Como funciona
1. Entre em **Clientes cadastrados** e clique em **Importar Excel**.
2. Selecione o arquivo .xlsx, .xls ou .csv.
3. Escolha um Projeto/NUI ou deixe **Sem NUI — vincular depois**.
4. Confira a prévia.
5. Escolha se deseja criar/atualizar por Código do Processo ou somente inserir novos.
6. Execute a importação.

O NUI não é obrigatório. Um cliente importado sem NUI pode ser editado posteriormente e vinculado ao Projeto/NUI correto. Ao escolher um Projeto/NUI na importação, o CRM preenche automaticamente projeto_id, NUI, município e estado.

O campo CodigoProcesso é usado como identificador principal de duplicidade.
