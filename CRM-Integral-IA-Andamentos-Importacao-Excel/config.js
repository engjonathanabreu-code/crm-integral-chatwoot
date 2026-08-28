window.CRM_CONFIG = {
  supabaseUrl: "COLE_AQUI_A_PROJECT_URL",
  supabaseAnonKey: "COLE_AQUI_A_PUBLISHABLE_KEY"
};

window.addEventListener("DOMContentLoaded", () => {
  import("./commercial-assignment-patch.js?v=20260828a").catch((error) => console.error("Falha ao carregar permissão Comercial", error));
});
