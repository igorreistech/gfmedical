-- Perfis novos em "Usuários": operador (acessos do Admin, sem gerenciar usuários),
-- pendente (auto-cadastro aguardando aprovação) e recusado.
-- A coluna usuarios.role é do tipo enum role_usuario. Rodar nos DOIS projetos (Campo Grande e Cuiabá).
alter type role_usuario add value if not exists 'operador';
alter type role_usuario add value if not exists 'pendente';
alter type role_usuario add value if not exists 'recusado';

notify pgrst, 'reload schema';
