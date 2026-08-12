# Guia de instalação — CRM Integral Profissional

Siga na ordem. Não pule a etapa do banco.

## 1. Criar o Supabase

1. Acesse `https://supabase.com` e faça login.
2. Clique em **New project**.
3. Nome: `CRM Integral`.
4. Crie e guarde uma senha forte do banco.
5. Escolha uma região próxima e aguarde o projeto ficar pronto.

## 2. Criar o banco

1. No menu do projeto, abra **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo `supabase/schema.sql` deste pacote.
4. Copie tudo, cole no editor e clique em **Run**.
5. Abra **Table Editor** e confirme as tabelas:
   - `profiles`
   - `clientes`
   - `atendimentos`
   - `tarefas`
   - `historico`
   - `marketing_etapas`
   - `marketing_projetos`
   - `marketing_progresso`

## 3. Criar o primeiro administrador

1. Abra **Authentication > Users**.
2. Clique em **Add user / Create user**.
3. Informe seu e-mail e uma senha forte.
4. Confirme o usuário.
5. Volte ao **SQL Editor** e execute, trocando o e-mail:

```sql
update public.profiles
set nome = 'Administrador Integral', perfil = 'admin', ativo = true
where id = (
  select id from auth.users
  where email = 'SEU_EMAIL@DOMINIO.COM'
);
```

## 4. Conectar o site ao Supabase

1. No Supabase, abra **Project Settings > API** ou **API Keys**.
2. Copie:
   - Project URL
   - Publishable Key (em projetos antigos pode aparecer como anon/public key)
3. Abra `config.js` no Bloco de Notas.
4. Substitua os dois textos de exemplo:

```js
window.CRM_CONFIG = {
  supabaseUrl: "https://SEU-PROJETO.supabase.co",
  supabaseAnonKey: "SUA_PUBLISHABLE_KEY"
};
```

5. Salve o arquivo.

**Nunca use a Service Role Key no navegador.**

## 5. Testar antes de publicar

Por segurança do navegador, prefira abrir usando um servidor local.

### Opção simples com VS Code

1. Instale o VS Code.
2. Abra a pasta do CRM.
3. Instale a extensão `Live Server`.
4. Clique com o botão direito em `index.html`.
5. Escolha **Open with Live Server**.
6. Entre usando o e-mail e senha criados no Supabase.

## 6. Criar outros usuários — forma mais fácil

Antes de publicar a função administrativa, você pode criar usuários diretamente no Supabase:

1. Abra **Authentication > Users**.
2. Clique em **Add user**.
3. Informe e-mail e senha.
4. O perfil será criado automaticamente como `usuario`.
5. Entre no CRM como admin e abra **Usuários** para alterar perfil ou desativar.
6. Para dar acesso à aba **Controle de Marketing**, defina o perfil do usuário como `Marketing` (perfis `Administrador` já têm acesso automaticamente).

## 7. Habilitar criação de usuários dentro do CRM

Essa etapa publica a função segura `admin-create-user`.

> **Importante:** este pacote já está configurado com `verify_jwt = false` para compatibilidade com a chave `sb_publishable_...`. A própria função valida a sessão e confirma que o usuário é administrador antes de criar qualquer conta.

### Instalar o necessário

1. Instale o Node.js LTS em `https://nodejs.org`.
2. Abra o Prompt de Comando dentro da pasta do CRM.
3. Execute:

```bash
npx supabase login
```

4. O navegador será aberto para autorizar.
5. Descubra o **Project Reference** em **Project Settings > General**.
6. Execute, trocando pelo código do projeto:

```bash
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy admin-create-user --no-verify-jwt
```

O Supabase fornece `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` à função no ambiente do servidor. A chave administrativa não vai para o navegador.

## 8. Publicar na Vercel

Como seu domínio já está vinculado a um projeto, a melhor forma é publicar esta pasta no mesmo projeto.

### Pelo Prompt de Comando

1. Instale o Node.js LTS.
2. Abra o Prompt dentro da pasta do CRM.
3. Execute:

```bash
npx vercel login
npx vercel link
npx vercel --prod
```

4. Em `vercel link`, selecione a conta e o projeto ao qual `crmintegralreurb.work` já está ligado.
5. Depois de `vercel --prod`, o domínio receberá a versão nova.

## 9. Testes obrigatórios

1. Admin entra no CRM.
2. Admin cadastra um cliente.
3. Cliente aparece no município correto.
4. Card abre a ficha e a linha do tempo.
5. Atualização aparece no histórico.
6. Atendimento atualiza o último contato.
7. Tarefa pode ser concluída e reaberta.
8. Crie um usuário comum.
9. Atribua um cliente a esse usuário.
10. Entre com o usuário comum e confirme que ele não vê clientes de outros usuários.
11. Entre novamente como admin e confirme que vê tudo.

## 10. Regras práticas

- Não cadastre dados reais antes de testar as permissões com dois usuários.
- Não compartilhe senha de administrador.
- Não coloque a `service_role` em arquivos publicados.
- Faça exportações e backups periódicos quando o uso real começar.

## Publicação automatizada incluída neste pacote

O pacote também está preparado para publicação por variáveis de ambiente, sem gravar chaves diretamente no repositório.

### Variáveis da Vercel

No projeto da Vercel, abra **Settings > Environment Variables** e cadastre para Production, Preview e Development:

- `SUPABASE_URL`: Project URL do Supabase.
- `SUPABASE_PUBLISHABLE_KEY`: Publishable Key do Supabase.

Depois publique normalmente. O comando de build gera a pasta `dist` e cria o `config.js` durante a publicação.

### Banco pelo Supabase CLI

A estrutura também está em `supabase/migrations/20260730000000_crm_integral_schema.sql`.

```bash
npm install
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
npx supabase functions deploy admin-create-user --no-verify-jwt
```

A execução manual do arquivo `supabase/schema.sql` continua válida e produz a mesma estrutura.
