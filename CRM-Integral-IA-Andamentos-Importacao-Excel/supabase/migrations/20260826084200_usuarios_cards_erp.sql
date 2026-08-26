-- Aba Usuários no padrão do ERP.
-- Alteração aditiva: preserva o mesmo profiles.id e todos os vínculos históricos.

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists setor text;

update public.profiles p
set email = lower(u.email)
from auth.users u
where u.id = p.id
  and (p.email is null or btrim(p.email) = '')
  and u.email is not null;

update public.profiles
set setor = case perfil
  when 'admin' then 'Administrativo'
  when 'marketing' then 'Marketing'
  when 'comercial' then 'Comercial'
  else 'Atendimento'
end
where setor is null or btrim(setor) = '';

comment on column public.profiles.email is 'E-mail de acesso espelhado do Supabase Auth; alterações preservam o mesmo profile.id.';
comment on column public.profiles.setor is 'Setor organizacional do usuário, independente do perfil de permissão.';
