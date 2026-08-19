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
      return new Response(JSON.stringify({ error: "Somente administradores podem redefinir senhas." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, password } = await req.json();

    if (!user_id || !password) {
      throw new Error("Usuário e nova senha são obrigatórios.");
    }
    if (String(password).length < 8) {
      throw new Error("A senha deve ter pelo menos 8 caracteres.");
    }

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", user_id)
      .maybeSingle();

    if (!targetProfile) throw new Error("Usuário não encontrado.");

    const { error } = await adminClient.auth.admin.updateUserById(user_id, { password });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Erro interno." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
