window.CRM_CONFIG = {
  supabaseUrl: "COLE_AQUI_A_PROJECT_URL",
  supabaseAnonKey: "COLE_AQUI_A_PUBLISHABLE_KEY"
};

window.addEventListener("DOMContentLoaded", () => {
  const userCardPolish = document.createElement("link");
  userCardPolish.rel = "stylesheet";
  userCardPolish.href = "./user-card-polish.css?v=20260828a";
  document.head.appendChild(userCardPolish);

  const slaStyle = document.createElement("link");
  slaStyle.rel = "stylesheet";
  slaStyle.href = "./funil-sla-manual.css?v=20260902b";
  document.head.appendChild(slaStyle);

  import("./commercial-assignment-patch.js?v=20260828a").catch((error) => console.error("Falha ao carregar permissão Comercial", error));
  import("./projeto-metas-erp.js?v=20260902a").catch((error) => console.error("Falha ao carregar metas dos projetos", error));
  import("./funil-sla-manual.js?v=20260902b").catch((error) => console.error("Falha ao carregar SLA opcional do Funil", error));
});
