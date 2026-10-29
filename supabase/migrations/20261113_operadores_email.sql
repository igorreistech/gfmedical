-- E-mail de cada operador das contas compartilhadas (comercial@ / comercialmt@):
-- o operador confirma na entrada, o admin aprova em "Usuários". Rodar nos DOIS projetos.
create table if not exists public.operadores_email (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  conta text not null,
  email text not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por text
);
create unique index if not exists operadores_email_nome_conta on public.operadores_email (nome, conta);

alter table public.operadores_email enable row level security;
drop policy if exists operadores_email_ler on public.operadores_email;
drop policy if exists operadores_email_inserir on public.operadores_email;
drop policy if exists operadores_email_alterar on public.operadores_email;
drop policy if exists operadores_email_excluir on public.operadores_email;
-- quem está logado lê e envia; alterar/excluir (aprovar, recusar, reenviar) só perfil admin
create policy operadores_email_ler on public.operadores_email for select to authenticated using (true);
create policy operadores_email_inserir on public.operadores_email for insert to authenticated with check (status = 'pendente');
create policy operadores_email_alterar on public.operadores_email for update to authenticated
  using (exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role::text = 'admin'));
create policy operadores_email_excluir on public.operadores_email for delete to authenticated
  using (exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role::text = 'admin'));

-- login individual do operador (criado quando ele escolhe a senha)
alter table public.operadores_email add column if not exists user_id uuid;

notify pgrst, 'reload schema';
