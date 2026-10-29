-- Libera os perfis novos na tabela de usuários: operador (acessos do Admin, sem gerenciar usuários),
-- pendente (auto-cadastro aguardando aprovação) e recusado. Rodar nos DOIS projetos (Campo Grande e Cuiabá).
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.usuarios'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.usuarios drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.usuarios add constraint usuarios_role_check
  check (role in ('admin', 'operador', 'agendador', 'visualizacao', 'pendente', 'recusado')) not valid;

notify pgrst, 'reload schema';
