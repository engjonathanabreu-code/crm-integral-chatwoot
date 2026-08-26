import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CONFIG = window.CRM_CONFIG || {};
const USER_SECTORS = [
  "Administrativo",
  "Atendimento",
  "Comercial",
  "Financeiro",
  "Projetos",
  "Topografia",
  "Marketing",
  "Pós-Protocolo",
];
const USER_ROLES = [
  ["usuario", "Usuário"],
  ["comercial", "Comercial"],
  ["marketing", "Marketing"],
  ["admin", "Administrador"],
];

const roleLabel = (role) => USER_ROLES.find(([value]) => value === role)?.[1] || "Usuário";
const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const normalizeNickname = (value) => String(value || "").trim().toLowerCase();
const isValidNickname = (value) => /^[a-z0-9._-]{3,30}$/.test(normalizeNickname(value));
const validEmail = (value) => /^\S+@\S+\.\S+$/.test(String(value || "").trim());
const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
};

function optionHtml(value, label, selectedValue) {
  return `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function sectorOptions(selected) {
  const values = new Set(USER_SECTORS);
  if (selected) values.add(selected);
  return [...values].map((sector) => optionHtml(sector, sector, selected)).join("");
}

function roleOptions(selected) {
  return USER_ROLES.map(([value, label]) => optionHtml(value, label, selected)).join("");
}

function componentCss() {
  return `
    :host{display:block;color:var(--text,#172321);font-family:inherit}
    *{box-sizing:border-box}
    .user-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:16px;align-items:stretch}
    .user-admin-card{appearance:none;width:100%;min-height:154px;padding:18px 18px 16px;text-align:left;color:var(--text,#172321);border:1px solid var(--line,#dfe9e7);border-radius:16px;background:#fff;overflow:hidden;cursor:pointer;font:inherit;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
    .user-admin-card:hover{transform:translateY(-2px);border-color:rgba(15,95,91,.32);box-shadow:0 14px 32px rgba(15,95,91,.14)}
    .user-admin-card:focus-visible{outline:3px solid rgba(15,95,91,.18);outline-offset:2px}
    .user-admin-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;min-width:0}
    .user-admin-card-head>div{min-width:0;flex:1 1 auto}
    .user-admin-card-head strong{display:block;font-size:16px;line-height:1.22;color:#111;overflow-wrap:anywhere}
    .muted{color:var(--muted,#71807d)}
    .user-admin-card-head .muted{display:block;margin-top:4px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
    .badge{flex:0 0 auto;align-self:flex-start;margin:0;white-space:nowrap;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:800;line-height:1;background:#edf3f2;color:#52615e}
    .badge.ok{background:#e7f7f1;color:#14705b}.badge.off{background:#fff0f0;color:#a33c3c}
    .user-admin-card-meta{display:grid;gap:6px;margin-top:14px;padding-top:12px;border-top:1px solid #edf3f2;font-size:13px;line-height:1.3}
    .user-admin-card-meta span{min-width:0;overflow-wrap:anywhere}.user-admin-card-meta b{color:var(--text,#172321)}
    .empty{padding:28px;text-align:center;border:1px dashed var(--line,#dfe9e7);border-radius:16px;color:var(--muted,#71807d);background:#fff}
    dialog{width:min(720px,calc(100vw - 28px));max-height:calc(100vh - 28px);border:0;border-radius:20px;padding:0;box-shadow:0 28px 80px rgba(17,35,32,.24);color:var(--text,#172321)}
    dialog::backdrop{background:rgba(8,25,22,.42);backdrop-filter:blur(2px)}
    form{padding:24px;background:#fff}
    .dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px}
    .eyebrow{margin:0 0 4px;color:var(--primary,#0f5f5b);font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}
    h2{margin:0;font-size:24px;line-height:1.15}p{margin:5px 0 0}.close{border:0;background:#eef4f3;border-radius:10px;width:38px;height:38px;font-size:24px;cursor:pointer;color:inherit}
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px}.span-two{grid-column:1/-1}
    label{display:grid;gap:6px;font-size:12px;font-weight:800;color:#34423f}
    input,select{width:100%;min-height:44px;border:1px solid var(--line,#d7e2df);border-radius:10px;background:#fff;padding:10px 12px;font:inherit;color:var(--text,#172321);outline:none}
    input:focus,select:focus{border-color:var(--primary,#0f5f5b);box-shadow:0 0 0 3px rgba(15,95,91,.1)}
    .password-box{grid-column:1/-1;margin-top:4px;padding:15px;border-radius:14px;background:#f6f9f8;border:1px solid #e5eeec}
    .password-box strong{display:block;margin-bottom:3px}.password-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    .hint{font-size:12px;font-weight:400;color:var(--muted,#71807d)}
    .message{min-height:18px;margin-top:13px;font-size:13px;color:#a33c3c}.message.success{color:#14705b}
    .dialog-actions{display:flex;align-items:center;gap:10px;margin-top:18px;padding-top:16px;border-top:1px solid #edf3f2}.spacer{flex:1}
    button.action{min-height:42px;border-radius:10px;padding:9px 15px;font:inherit;font-weight:800;cursor:pointer}.secondary{border:1px solid var(--line,#d7e2df);background:#fff;color:inherit}.primary{border:1px solid var(--primary,#0f5f5b);background:var(--primary,#0f5f5b);color:#fff}
    button[disabled]{opacity:.58;cursor:not-allowed}
    @media(max-width:720px){.user-card-grid{grid-template-columns:1fr}.user-admin-card{min-height:auto}.form-grid,.password-grid{grid-template-columns:1fr}.span-two,.password-box{grid-column:auto}}
  `;
}

class CrmUsersAdmin {
  constructor(host) {
    this.host = host;
    this.shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    this.supabase = null;
    this.profiles = [];
    this.currentProfile = null;
    this.refreshTimer = null;
    this.observer = null;
  }

  async init() {
    if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey || CONFIG.supabaseUrl.includes("COLE_AQUI")) return;
    this.supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    this.renderShell();
    this.bind();
    await this.loadProfiles();

    this.observer = new MutationObserver(() => {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => this.loadProfiles(), 120);
    });
    this.observer.observe(this.host, { childList: true, subtree: true });

    const oldHead = document.querySelector(".users-list-head");
    if (oldHead) oldHead.style.display = "none";
    const description = document.querySelector(".users-directory-head .muted");
    if (description) description.textContent = "Clique em um usuário para editar dados, acesso, setor, função e senha.";
  }

  renderShell() {
    this.shadow.innerHTML = `
      <style>${componentCss()}</style>
      <div id="cards" class="user-card-grid"></div>
      <dialog id="editor">
        <form id="userForm">
          <div class="dialog-head">
            <div><p class="eyebrow">Equipe e acessos</p><h2 id="dialogTitle">Editar usuário</h2><p id="dialogSubtitle" class="muted"></p></div>
            <button type="button" class="close" id="closeDialog" aria-label="Fechar">×</button>
          </div>
          <div class="form-grid">
            <label class="span-two">Nome completo<input id="userName" required maxlength="120" /></label>
            <label>Nome de usuário<input id="userNickname" required maxlength="30" autocomplete="off" /></label>
            <label>E-mail de acesso<input id="userEmail" type="email" required /></label>
            <label>Setor<select id="userSector"></select></label>
            <label>Função / permissão<select id="userRole"></select></label>
            <label>Status<select id="userActive"><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
            <div></div>
            <div class="password-box">
              <strong>Alterar senha</strong>
              <span class="hint">Deixe os dois campos vazios para manter a senha atual.</span>
              <div class="password-grid">
                <label>Nova senha<input id="userPassword" type="password" minlength="8" autocomplete="new-password" /></label>
                <label>Confirmar senha<input id="userPasswordConfirm" type="password" minlength="8" autocomplete="new-password" /></label>
              </div>
            </div>
          </div>
          <p id="message" class="message"></p>
          <div class="dialog-actions">
            <span class="hint" id="createdAt"></span><div class="spacer"></div>
            <button type="button" class="action secondary" id="cancelDialog">Cancelar</button>
            <button type="submit" class="action primary" id="saveUser">Salvar alterações</button>
          </div>
        </form>
      </dialog>`;
  }

  bind() {
    this.shadow.getElementById("cards").addEventListener("click", (event) => {
      const card = event.target.closest("[data-user-card]");
      if (!card) return;
      const profile = this.profiles.find((item) => item.id === card.dataset.userCard);
      if (profile) this.open(profile);
    });
    this.shadow.getElementById("closeDialog").addEventListener("click", () => this.close());
    this.shadow.getElementById("cancelDialog").addEventListener("click", () => this.close());
    this.shadow.getElementById("userForm").addEventListener("submit", (event) => this.save(event));
  }

  async loadProfiles() {
    if (!this.supabase) return;
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id,nome,apelido,email,setor,perfil,ativo,created_at")
      .order("nome");
    if (error) {
      console.error("users-admin: não foi possível carregar perfis", error);
      this.shadow.getElementById("cards").innerHTML = `<div class="empty">Não foi possível carregar os usuários.</div>`;
      return;
    }
    this.profiles = data || [];
    this.renderCards();
    const count = document.getElementById("usersCount");
    if (count) count.textContent = String(this.profiles.length);
  }

  renderCards() {
    const cards = this.shadow.getElementById("cards");
    cards.innerHTML = this.profiles.length ? this.profiles.map((profile) => `
      <button type="button" class="user-admin-card" data-user-card="${profile.id}">
        <div class="user-admin-card-head">
          <div><strong>${escapeHtml(profile.nome || profile.apelido || "Usuário")}</strong><span class="muted">${escapeHtml(profile.email || "E-mail não informado")}</span></div>
          <span class="badge ${profile.ativo ? "ok" : "off"}">${profile.ativo ? "Ativo" : "Inativo"}</span>
        </div>
        <div class="user-admin-card-meta">
          <span><b>Setor:</b> ${escapeHtml(profile.setor || "—")}</span>
          <span><b>Função:</b> ${escapeHtml(roleLabel(profile.perfil))}</span>
          <span><b>Usuário:</b> ${profile.apelido ? `@${escapeHtml(profile.apelido)}` : "—"}</span>
        </div>
      </button>`).join("") : `<div class="empty">Nenhum usuário cadastrado.</div>`;
  }

  open(profile) {
    this.currentProfile = profile;
    this.shadow.getElementById("dialogTitle").textContent = profile.nome || "Editar usuário";
    this.shadow.getElementById("dialogSubtitle").textContent = profile.email || profile.apelido || "Conta da equipe";
    this.shadow.getElementById("userName").value = profile.nome || "";
    this.shadow.getElementById("userNickname").value = profile.apelido || "";
    this.shadow.getElementById("userEmail").value = profile.email || "";
    this.shadow.getElementById("userSector").innerHTML = sectorOptions(profile.setor || "Atendimento");
    this.shadow.getElementById("userRole").innerHTML = roleOptions(profile.perfil || "usuario");
    this.shadow.getElementById("userActive").value = String(profile.ativo !== false);
    this.shadow.getElementById("userPassword").value = "";
    this.shadow.getElementById("userPasswordConfirm").value = "";
    this.shadow.getElementById("createdAt").textContent = `Cadastro: ${formatDate(profile.created_at)}`;
    this.setMessage("");
    this.shadow.getElementById("editor").showModal();
  }

  close() {
    const dialog = this.shadow.getElementById("editor");
    if (dialog.open) dialog.close();
    this.currentProfile = null;
  }

  setMessage(text, success = false) {
    const message = this.shadow.getElementById("message");
    message.textContent = text;
    message.className = `message${success ? " success" : ""}`;
  }

  async save(event) {
    event.preventDefault();
    const profile = this.currentProfile;
    if (!profile) return;

    const name = this.shadow.getElementById("userName").value.trim();
    const nickname = normalizeNickname(this.shadow.getElementById("userNickname").value);
    const email = this.shadow.getElementById("userEmail").value.trim().toLowerCase();
    const sector = this.shadow.getElementById("userSector").value;
    const role = this.shadow.getElementById("userRole").value;
    const active = this.shadow.getElementById("userActive").value === "true";
    const password = this.shadow.getElementById("userPassword").value;
    const passwordConfirm = this.shadow.getElementById("userPasswordConfirm").value;
    const saveButton = this.shadow.getElementById("saveUser");

    if (!name) return this.setMessage("O nome completo é obrigatório.");
    if (!isValidNickname(nickname)) return this.setMessage("O nome de usuário deve ter 3 a 30 caracteres: letras, números, ponto, hífen ou _.");
    if (!validEmail(email)) return this.setMessage("Informe um e-mail válido.");
    if (password && password.length < 8) return this.setMessage("A nova senha deve ter pelo menos 8 caracteres.");
    if (password !== passwordConfirm) return this.setMessage("As senhas não coincidem.");

    const { data: sessionData } = await this.supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;
    if (profile.id === currentUserId && !active) return this.setMessage("Você não pode desativar seu próprio usuário.");

    saveButton.disabled = true;
    this.setMessage("Salvando alterações...");

    try {
      const emailChanged = email !== String(profile.email || "").toLowerCase();
      if (emailChanged || password) {
        const body = { user_id: profile.id };
        if (emailChanged) body.email = email;
        if (password) body.password = password;
        const { data, error } = await this.supabase.functions.invoke("admin-reset-password", { body });
        if (error || data?.error) throw new Error(data?.error || error?.message || "Não foi possível alterar as credenciais.");
      }

      const { error: profileError } = await this.supabase
        .from("profiles")
        .update({ nome: name, apelido: nickname, setor: sector, perfil: role, ativo: active })
        .eq("id", profile.id);
      if (profileError) throw profileError;

      this.setMessage("Alterações salvas com sucesso.", true);
      await this.loadProfiles();
      document.getElementById("refreshButton")?.click();

      const changedOwnRole = profile.id === currentUserId && role !== profile.perfil;
      setTimeout(() => {
        this.close();
        if (changedOwnRole) window.location.reload();
      }, 550);
    } catch (error) {
      console.error("users-admin: erro ao salvar usuário", error);
      this.setMessage(error?.message || "Não foi possível salvar as alterações.");
    } finally {
      saveButton.disabled = false;
    }
  }
}

function bootUsersAdmin() {
  const host = document.getElementById("usersList");
  if (!host || host.shadowRoot) return;
  const component = new CrmUsersAdmin(host);
  component.init().catch((error) => console.error("users-admin: falha ao iniciar", error));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootUsersAdmin, { once: true });
else bootUsersAdmin();
