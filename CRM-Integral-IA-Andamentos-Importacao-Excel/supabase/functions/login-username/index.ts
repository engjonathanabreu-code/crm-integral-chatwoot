import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, password } = await req.json();
    const normalized = String(username || "").trim().toLowerCase();

    if (!/^[a-z0-9._-]{3,30}$/.test(normalized) || !password) {
      throw new Error("Usuário ou senha inválidos.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id,ativo")
      .ilike("apelido", normalized)
      .maybeSingle();

    if (profileError || !profile?.id || !profile.ativo) {
      throw new Error("Usuário ou senha inválidos.");
    }

    const { data: authUser, error: authUserError } =
      await adminClient.auth.admin.getUserById(profile.id);

    const email = authUser?.user?.email;
    if (authUserError || !email) {
      throw new Error("Usuário ou senha inválidos.");
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      throw new Error("Usuário ou senha inválidos.");
    }

    return new Response(
      JSON.stringify({
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
        user: { id: data.user.id },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (_error) {
    return new Response(
      JSON.stringify({ error: "Usuário ou senha inválidos." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
