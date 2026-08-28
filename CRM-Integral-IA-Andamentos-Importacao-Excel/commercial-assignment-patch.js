import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CONFIG = window.CRM_CONFIG || {};
if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && !String(CONFIG.supabaseUrl).includes("COLE_AQUI")) {
  const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  let isCommercial = false;
  let pendingAssignment = null;
  let applying = false;

  const $ = (id) => document.getElementById(id);

  async function initProfile() {
    const { data: { session } } = await db.auth.getSession();
    if (!session?.user) return;
    const { data: profile } = await db.from("profiles").select("perfil,setor").eq("id", session.user.id).maybeSingle();
    isCommercial = profile?.perfil === "comercial" || profile?.setor === "Comercial";
    if (!isCommercial) return;
    install();
  }

  function enableCommercialSelector() {
    if (!isCommercial) return;
    const dialog = $("clientFormDialog");
    const select = $("clientComercial");
    if (!dialog?.open || !select) return;
    select.disabled = false;
    const label = select.closest("label");
    const help = label?.querySelector(".field-help, small");
    if (help) help.textContent = "Admin, usuários do Comercial ou quem cadastrou o cliente podem atribuir/trocar o Comercial.";
  }

  async function applyPendingAssignment() {
    if (!pendingAssignment || applying) return;
    const { clientId, comercialId, previousId } = pendingAssignment;
    pendingAssignment = null;
    if (!clientId || comercialId === previousId) return;
    applying = true;
    try {
      // Aguarda o salvamento normal do card terminar para que esta atribuição seja a última gravação.
      await new Promise((resolve) => setTimeout(resolve, 450));
      const { error } = await db.from("clientes").update({ comercial_id: comercialId || null }).eq("id", clientId);
      if (error) throw error;
      const { data: { session } } = await db.auth.getSession();
      if (session?.user) {
        const fromText = previousId ? "Comercial anterior" : "Sem comercial atribuído";
        const toText = selectTextForValue(comercialId) || "Sem comercial atribuído";
        await db.from("historico").insert({
          cliente_id: clientId,
          created_by: session.user.id,
          tipo: "Comercial atribuído",
          descricao: `${fromText} → ${toText}`,
        });
      }
      window.location.reload();
    } catch (error) {
      console.error("Falha ao atribuir Comercial", error);
      const toast = $("toast");
      if (toast) {
        toast.textContent = `Não foi possível atribuir o Comercial: ${error.message || error}`;
        toast.className = "toast error";
      }
    } finally {
      applying = false;
    }
  }

  function selectTextForValue(value) {
    const select = $("clientComercial");
    return [...(select?.options || [])].find((option) => option.value === value)?.textContent?.trim() || "";
  }

  function install() {
    const dialog = $("clientFormDialog");
    const form = $("clientForm");
    const select = $("clientComercial");
    if (!dialog || !form || !select) {
      setTimeout(install, 250);
      return;
    }

    const observer = new MutationObserver(() => {
      if (dialog.open) enableCommercialSelector();
      else applyPendingAssignment();
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });

    form.addEventListener("submit", () => {
      if (!isCommercial) return;
      const clientId = $("clientId")?.value || "";
      if (!clientId) return;
      const selected = select.value || "";
      const previous = select.dataset.originalCommercial || "";
      pendingAssignment = { clientId, comercialId: selected, previousId: previous };
    }, true);

    select.addEventListener("focus", () => {
      if (!select.dataset.originalCommercial) select.dataset.originalCommercial = select.value || "";
    });

    document.addEventListener("click", (event) => {
      if (!isCommercial) return;
      if (event.target.closest("[data-edit-client], [data-open-client]")) {
        setTimeout(() => {
          enableCommercialSelector();
          if (dialog.open) select.dataset.originalCommercial = select.value || "";
        }, 80);
      }
    }, true);

    enableCommercialSelector();
  }

  initProfile().catch((error) => console.error("Commercial assignment patch", error));
}
