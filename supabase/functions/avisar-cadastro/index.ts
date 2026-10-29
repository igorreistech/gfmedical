// Edge Function: avisa o(s) administrador(es) por e-mail quando alguém faz o
// auto-cadastro ("Solicitar cadastro" na tela de login) e precisa de aprovação.
//
// Chamada pela própria tela logo depois do cadastro, SEM login (a pessoa ainda
// não foi aprovada) — por isso:
//   • publicar com "Verify JWT" DESLIGADO (supabase functions deploy avisar-cadastro --no-verify-jwt);
//   • cria o perfil "pendente" em public.usuarios (aparece na lista do admin para aprovar);
//   • a function confere no Auth que o usuário existe, foi criado há menos de 15 min
//     e ainda não foi avisado (marca app_metadata.aviso_cadastro) — não dá para usar
//     de "disparador de e-mail" para outras coisas.
//
// Segredos (Project Settings → Edge Functions → Secrets):
//   RESEND_API_KEY  chave da conta no resend.com
//   ADMIN_EMAILS    e-mail(s) do admin, separados por vírgula
//   AVISO_REMETENTE (opcional) remetente; padrão "GF Medical <onboarding@resend.dev>"
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm do ambiente da function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  let body: { id?: string; unidade?: string; site?: string };
  try { body = await req.json(); } catch { return json({ error: 'Corpo inválido.' }, 400); }
  if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return json({ error: 'id inválido.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: got, error } = await admin.auth.admin.getUserById(body.id);
  const user = got?.user;
  if (error || !user) return json({ error: 'Usuário não encontrado.' }, 404);
  if (Date.now() - new Date(user.created_at).getTime() > 15 * 60 * 1000) return json({ ok: true, ignorado: 'antigo' });

  const nome = String(user.user_metadata?.nome || user.email || '').slice(0, 120);
  const email = String(user.email || '').toLowerCase();

  // Já entra na lista do admin como "aguardando aprovação" (sem esperar o 1º login da pessoa);
  // se o perfil já existir, não mexe.
  await admin.from('usuarios').upsert({ id: user.id, email, nome, role: 'pendente' }, { onConflict: 'id', ignoreDuplicates: true });

  if (user.app_metadata?.aviso_cadastro) return json({ ok: true, ignorado: 'já avisado' });
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const admins = (Deno.env.get('ADMIN_EMAILS') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!resendKey || !admins.length) return json({ ok: true, aviso: 'e-mail não configurado' });
  const unidade = String(body.unidade || '').slice(0, 40);
  const site = /^https:\/\/[\w.-]+(\/[\w./-]*)?$/.test(body.site || '') ? body.site! : '';

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937">
    <h2 style="color:#0e7490;margin:0 0 12px">📝 Novo cadastro aguardando aprovação</h2>
    <p><b>${esc(nome)}</b> (${esc(email)}) se cadastrou${unidade ? ' em <b>' + esc(unidade) + '</b>' : ''} e precisa da sua aprovação para entrar.</p>
    <p>Abra o Monitor → <b>👥 Usuários</b> e escolha <b>✅ Operador</b>, <b>✅ Agendador</b> ou <b>✖ Recusar</b>.</p>
    ${site ? `<p><a href="${esc(site)}" style="display:inline-block;padding:10px 16px;background:#0e7490;color:#fff;border-radius:8px;text-decoration:none">Abrir o Monitor</a></p>` : ''}
    <p style="color:#6b7280;font-size:12px">Aviso automático do GF Hub.</p></div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('AVISO_REMETENTE') || 'GF Medical <onboarding@resend.dev>',
      to: admins,
      subject: `Novo cadastro para aprovar: ${nome}${unidade ? ' (' + unidade + ')' : ''}`,
      html,
    }),
  });
  if (!r.ok) return json({ error: 'Falha ao enviar o e-mail: ' + (await r.text()).slice(0, 200) }, 502);

  await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...(user.app_metadata || {}), aviso_cadastro: new Date().toISOString() } });
  return json({ ok: true });
});
