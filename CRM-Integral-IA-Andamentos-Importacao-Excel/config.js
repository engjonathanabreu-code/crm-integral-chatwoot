window.CRM_CONFIG = {
  supabaseUrl: "COLE_AQUI_A_PROJECT_URL",
  supabaseAnonKey: "COLE_AQUI_A_PUBLISHABLE_KEY"
};

window.addEventListener("DOMContentLoaded", () => {
  const userCardPolish = document.createElement("link");
  userCardPolish.rel = "stylesheet";
  userCardPolish.href = "./user-card-polish.css?v=20260828a";
  document.head.appendChild(userCardPolish);

  import("./commercial-assignment-patch.js?v=20260828a").catch((error) => console.error("Falha ao carregar permissão Comercial", error));
});
