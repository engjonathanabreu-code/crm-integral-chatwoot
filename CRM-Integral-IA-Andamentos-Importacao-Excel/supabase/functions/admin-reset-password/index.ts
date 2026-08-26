import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Sessão não encontrada.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Sessão inválida.");

    const { data: requester } = await adminClient
      .from("profiles")
      .select("perfil,ativo")
      .eq("id", userData.user.id)
      .single();

    if (!requester?.ativo || requester.perfil !== "admin") {
      return new Response(JSON.stringify({ error: "Somente administradores podem alterar credenciais de usuários." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, password, email } = await req.json();
    if (!user_id) throw new Error("Usuário é obrigatório.");

    const normalizedEmail = email == null ? null : String(email).trim().toLowerCase();
    if (password != null && String(password).length < 8) {
      throw new Error("A senha deve ter pelo menos 8 caracteres.");
    }
    if (normalizedEmail != null && !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      throw new Error("Informe um e-mail válido.");
    }
    if (!password && !normalizedEmail) {
      throw new Error("Informe um novo e-mail ou uma nova senha.");
    }

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", user_id)
      .maybeSingle();
    if (!targetProfile) throw new Error("Usuário não encontrado.");

    const authChanges: Record<string, unknown> = {};
    if (password) authChanges.password = String(password);
    if (normalizedEmail) {
      authChanges.email = normalizedEmail;
      authChanges.email_confirm = true;
    }

    const { error: authError } = await adminClient.auth.admin.updateUserById(user_id, authChanges);
    if (authError) throw authError;

    if (normalizedEmail) {
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ email: normalizedEmail })
        .eq("id", user_id);
      if (profileError) throw profileError;
    }

    return new Response(JSON.stringify({ ok: true, user_id, email: normalizedEmail || undefined }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
