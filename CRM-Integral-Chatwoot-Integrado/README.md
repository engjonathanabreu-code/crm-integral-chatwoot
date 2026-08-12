# CRM Integral Profissional

CRM online para comercial e atendimento da Integral, conectado ao Supabase.

## O que está incluído

- Login real por e-mail e senha.
- Perfil administrador e perfil usuário.
- Usuário comum acessa somente a própria carteira.
- Administrador acessa todos os clientes e pode redistribuí-los.
- Clientes apresentados em cards e agrupados por município.
- Campos Município, Núcleo e Remessa.
- Funil comercial.
- Atendimentos por Documental, Topografia, Projetos, Financeiro e Geral.
- Tarefas com prazo, prioridade e responsável.
- Histórico completo do cliente.
- Atualizações rápidas e registro de contato.
- Data de cadastro e último contato automáticos.
- Painel administrativo de usuários.
- Layout responsivo para computador e celular.
- **Controle de Marketing**: um cartão por município com a jornada do cliente (5 fases, 15 etapas fixas) usada para alimentar os grupos de WhatsApp. Cada etapa é marcada como concluída ou pendente. Só os perfis Administrador e Marketing enxergam e preenchem esta aba.
- **Clientes organizados por Município → NUI**: a base de clientes é agrupada em duas camadas (município e depois núcleo urbano informal — NUI), com seções que expandem/colapsam e busca que atravessa as duas camadas.
- **Atendimentos e tarefas avulsos**: é possível registrar um atendimento ou criar uma tarefa direto das abas Atendimentos/Tarefas, sem precisar abrir a ficha do cliente primeiro — basta buscar o cliente pelo nome, município ou NUI.
- **Paginação nas listas de Atendimentos e Tarefas** ("Carregar mais"), pensada para o volume semanal de cadastros (na casa das centenas).

## Atualizando uma instalação já existente

Se o CRM já estava publicado antes da aba de Controle de Marketing, basta rodar o `supabase/schema.sql` de novo no SQL Editor do seu projeto — ele é seguro para reexecução (`create table if not exists`, `on conflict do nothing`) e vai: liberar o novo perfil "marketing" nos usuários, criar as tabelas de marketing e já popular as 15 etapas fixas da jornada.

## Arquivos principais

- `index.html`: estrutura do CRM.
- `style.css`: visual do sistema.
- `app.js`: regras e integração com Supabase.
- `config.js`: Project URL e Publishable Key.
- `vercel.json`: publicação e cabeçalhos de segurança.
- `supabase/schema.sql`: banco, gatilhos e permissões.
- `supabase/functions/admin-create-user/index.ts`: criação segura de usuários pelo admin.
- `GUIA-INSTALACAO.md`: implantação detalhada.

## Segurança

A chave administrativa `service_role` nunca deve ser colocada em `config.js`, `app.js` ou qualquer arquivo publicado. O navegador usa somente a Publishable Key; a separação de dados é aplicada no banco pelas políticas de Row Level Security.


## Versão Projetos / Andamentos

Esta versão adiciona as abas **Projetos / Núcleos Urbanos** e **Andamentos**, além de vincular o **Controle de Marketing** aos projetos. Ela pode ser publicada na Vercel antes da migração do banco: enquanto as tabelas novas não existirem, o CRM exibe um aviso e mantém os módulos antigos funcionando. Depois, execute `supabase/MIGRACAO-PROJETOS-ANDAMENTOS.sql` no Supabase atual.


## Refinamento da aba Andamentos

A aba Andamentos foi redesenhada para operar com centenas de Projetos/Núcleos simultaneamente.

- busca por Projeto/Núcleo, cidade, estado e texto;
- filtros por projeto, UF, status e presença de andamento;
- paginação configurável em 20, 40 ou 80 registros;
- indicadores de total, projetos atualizados, sem andamento e concluídos;
- visão compacta mostrando somente o último status de cada projeto;
- expansão individual para visualizar o histórico completo;
- exclusão de um andamento específico com confirmação;
- exclusão nunca remove o Projeto/Núcleo nem clientes vinculados.


## Usuários por apelido

Esta versão adiciona `apelido` aos perfis. O apelido é único e funciona como nome de usuário no login.

Para ativar no Supabase atual:

1. Execute `supabase/MIGRACAO-USUARIOS-APELIDO.sql`.
2. Republique a Edge Function `admin-create-user`.
3. Publique a nova Edge Function `login-username`.
4. Usuários antigos continuam podendo entrar por e-mail enquanto não tiverem apelido.
5. Depois de definir um apelido, podem entrar usando `apelido + senha` ou `e-mail + senha`.


## Integração Chatwoot / WhatsApp

Esta versão inclui `api/chatwoot-sync.js` e a tabela `interacoes`. Configure na Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRM_INTEGRATION_OWNER_ID` e `CRM_CHATWOOT_SYNC_SECRET`. O agente IA deve encaminhar cada payload do Chatwoot para `/api/chatwoot-sync` usando `Authorization: Bearer <CRM_CHATWOOT_SYNC_SECRET>`.

Execute `supabase/MIGRACAO-CHATWOOT-CRM.sql` se estiver atualizando uma instalação existente. Em projeto novo, `supabase/schema.sql` já contém a estrutura.
