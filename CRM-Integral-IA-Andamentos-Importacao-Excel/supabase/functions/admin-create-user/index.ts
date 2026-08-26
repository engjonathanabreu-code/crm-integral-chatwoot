import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const defaultSectorForRole = (perfil: string) => {
  if (perfil === "admin") return "Administrativo";
  if (perfil === "marketing") return "Marketing";
  if (perfil === "comercial") return "Comercial";
  return "Atendimento";
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
      return new Response(JSON.stringify({ error: "Somente administradores podem criar usuários." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { nome, apelido, email, password, perfil = "usuario", setor } = await req.json();
    const username = String(apelido || "").trim().toLowerCase();
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!nome || !username || !normalizedEmail || !password) {
      throw new Error("Nome, nome de usuário, e-mail e senha são obrigatórios.");
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error("Nome de usuário inválido.");
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error("Informe um e-mail válido.");
    if (String(password).length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");

    const { data: existingNickname } = await adminClient
      .from("profiles")
      .select("id")
      .ilike("apelido", username)
      .maybeSingle();
    if (existingNickname) throw new Error("Este nome de usuário já está em uso.");

    const perfilFinal = ["admin", "marketing", "comercial"].includes(perfil) ? perfil : "usuario";
    const setorFinal = String(setor || defaultSectorForRole(perfilFinal)).trim();

    const { data, error } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { nome, apelido: username, perfil: perfilFinal },
    });
    if (error) throw error;

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        nome: String(nome).trim(),
        apelido: username,
        email: normalizedEmail,
        perfil: perfilFinal,
        setor: setorFinal,
        ativo: true,
      })
      .eq("id", data.user.id);
    if (profileError) throw profileError;

    return new Response(JSON.stringify({ user: { id: data.user.id, email: normalizedEmail } }), {
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
