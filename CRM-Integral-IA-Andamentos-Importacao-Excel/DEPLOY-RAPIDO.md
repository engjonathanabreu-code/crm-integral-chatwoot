# Deploy rápido

Este pacote já está corrigido para a função `admin-create-user` funcionar com a chave `sb_publishable_...`.

## 1. Supabase

### macOS
Dê dois cliques em `PUBLICAR-SUPABASE.command` e informe o **Project Reference**.

### Windows
Dê dois cliques em `PUBLICAR-SUPABASE.bat` e informe o **Project Reference**.

O script executa automaticamente:

- vínculo com o projeto;
- migrations do banco;
- deploy da função `admin-create-user`;
- deploy com `--no-verify-jwt`.

## 2. Vercel

Confirme no projeto da Vercel as variáveis:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Depois:

### macOS
Dê dois cliques em `PUBLICAR-VERCEL.command`.

### Windows
Dê dois cliques em `PUBLICAR-NA-VERCEL.bat`.

## 3. Primeiro administrador

No SQL Editor do Supabase, execute apenas o SQL abaixo, trocando o e-mail:

```sql
update public.profiles
set nome = 'Administrador Integral', perfil = 'admin', ativo = true
where id = (
  select id from auth.users
  where email = 'SEU_EMAIL@DOMINIO.COM'
);
```
