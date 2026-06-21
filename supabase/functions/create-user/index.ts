// Edge Function: cria um novo usuário (login real no Supabase Auth + linha
// em public.usuarios), chamada pela tela "Gerenciar Usuários" do admin.
//
// Por que isso precisa ser uma function e não uma escrita direta do client:
// criar um login real exige a service_role key (bypassa RLS / chama
// auth.admin.createUser), e essa chave NUNCA pode rodar no navegador.
// Esta function valida que quem está chamando é um admin autenticado antes
// de usar a service_role internamente — o client só tem o token do próprio
// usuário, nunca a chave privilegiada.
//
// Deploy: supabase functions deploy create-user --project-ref <ref>
// (variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já ficam disponíveis
// automaticamente no ambiente da function, não precisam ser configuradas
// manualmente — são injetadas pelo Supabase.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

function randomPassword() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 16);
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const callerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!callerToken) {
    return new Response(JSON.stringify({ error: 'Não autenticado.' }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Client "como o chamador" — só pra validar quem está fazendo a chamada.
  const callerClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser(callerToken);
  if (callerErr || !caller) {
    return new Response(JSON.stringify({ error: 'Sessão inválida.' }), { status: 401 });
  }

  // Client com privilégio total — só usado a partir daqui, nunca exposto ao client.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerProfile } = await admin.from('usuarios').select('role').eq('id', caller.id).maybeSingle();
  if (callerProfile?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Apenas administradores podem criar usuários.' }), { status: 403 });
  }

  let body: { email?: string; role?: string; nome?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corpo da requisição inválido.' }), { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  const role = body.role === 'admin' ? 'admin' : 'agendador';
  const nome = (body.nome || '').trim() || email;
  if (!email) {
    return new Response(JSON.stringify({ error: 'E-mail é obrigatório.' }), { status: 400 });
  }

  const tempPassword = randomPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true,
  });
  if (createErr) {
    return new Response(JSON.stringify({ error: createErr.message }), { status: 400 });
  }

  const { error: insertErr } = await admin.from('usuarios').insert({
    id: created.user.id, email, nome, role,
  });
  if (insertErr) {
    // Reverte a criação do login para não deixar conta órfã sem perfil.
    await admin.auth.admin.deleteUser(created.user.id);
    return new Response(JSON.stringify({ error: insertErr.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ id: created.user.id, temp_password: tempPassword }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
