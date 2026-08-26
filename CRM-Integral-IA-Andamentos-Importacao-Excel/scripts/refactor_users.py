from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
app_path = root / "app.js"
html_path = root / "index.html"
css_path = root / "style.css"
config_path = root / "config.js"
build_path = root / "scripts" / "build.mjs"
repo_root = root.parent

app = app_path.read_text(encoding="utf-8")

if "const USER_SECTORS =" not in app:
    app = app.replace(
        'const TICKET_SECTORS = ["Atendimento", "Comercial", "Financeiro", "Projetos", "Topografia", "Pós-Protocolo"];',
        'const TICKET_SECTORS = ["Atendimento", "Comercial", "Financeiro", "Projetos", "Topografia", "Pós-Protocolo"];\nconst USER_SECTORS = ["Administrativo", "Atendimento", "Comercial", "Financeiro", "Projetos", "Topografia", "Marketing", "Pós-Protocolo"];',
    )

app = app.replace(
    '.select("id,nome,apelido,perfil,ativo,created_at")',
    '.select("id,nome,apelido,email,setor,perfil,ativo,created_at")',
)

new_render = r'''function renderUsers() {
  if (!isAdmin()) return;

  $("usersCount").textContent = state.profiles.length;
  const roleLabels = { usuario: "Usuário", comercial: "Comercial", marketing: "Marketing", admin: "Administrador" };

  $("usersList").innerHTML = state.profiles.length ? state.profiles.map((profile) => `
    <button type="button" class="user-admin-card" data-edit-user="${profile.id}">
      <div class="user-admin-card-head">
        <div>
          <strong>${escapeHtml(profile.nome || profile.apelido || "Usuário")}</strong>
          <span class="muted">${escapeHtml(profile.email || "E-mail não informado")}</span>
        </div>
        <span class="badge ${profile.ativo ? "closed" : "lost"}">${profile.ativo ? "Ativo" : "Inativo"}</span>
      </div>
      <div class="user-admin-card-meta">
        <span><b>Setor:</b> ${escapeHtml(profile.setor || "—")}</span>
        <span><b>Função:</b> ${escapeHtml(roleLabels[profile.perfil] || "Usuário")}</span>
        <span><b>Usuário:</b> ${profile.apelido ? `@${escapeHtml(profile.apelido)}` : "—"}</span>
      </div>
    </button>`).join("") : emptyState("Nenhum usuário encontrado.");
}'''
app, count = re.subn(
    r"function renderUsers\(\) \{.*?\n\}\n\nfunction marketingProgressFor",
    new_render + "\n\nfunction marketingProgressFor",
    app,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError("renderUsers não localizado")

old_create = '''      perfil: $("newUserRole").value,
    },'''
new_create = '''      perfil: $("newUserRole").value,
      setor: $("newUserSector")?.value || null,
    },'''
if old_create not in app:
    raise RuntimeError("payload de criação de usuário não localizado")
app = app.replace(old_create, new_create, 1)

new_editor = r'''function openResetPasswordDialog(profile) {
  if (!profile) return;
  $("resetPasswordForm").reset();
  $("resetPasswordUserId").value = profile.id;
  $("resetPasswordName").value = profile.nome || "";
  $("resetPasswordNickname").value = profile.apelido || "";
  $("resetPasswordEmail").value = profile.email || "";
  $("resetPasswordSector").innerHTML = USER_SECTORS.map((sector) => `<option ${sector === (profile.setor || "Atendimento") ? "selected" : ""}>${escapeHtml(sector)}</option>`).join("");
  $("resetPasswordRole").value = profile.perfil || "usuario";
  $("resetPasswordActive").value = String(profile.ativo !== false);
  $("resetPasswordDialogTitle").textContent = profile.nome || "Editar usuário";
  $("resetPasswordDialogSubtitle").textContent = profile.email || (profile.apelido ? `@${profile.apelido}` : "Conta da equipe");
  $("resetPasswordMessage").className = "form-message";
  $("resetPasswordMessage").textContent = "";
  $("resetPasswordDialog").showModal();
}

async function submitResetPassword(event) {
  event.preventDefault();
  const message = $("resetPasswordMessage");
  message.className = "form-message";

  const userId = $("resetPasswordUserId").value;
  const current = state.profiles.find((profile) => profile.id === userId);
  if (!current) return;

  const nome = $("resetPasswordName").value.trim();
  const apelido = normalizeNickname($("resetPasswordNickname").value);
  const email = $("resetPasswordEmail").value.trim().toLowerCase();
  const setor = $("resetPasswordSector").value;
  const perfil = $("resetPasswordRole").value;
  const ativo = $("resetPasswordActive").value === "true";
  const pass1 = $("resetPasswordNew").value;
  const pass2 = $("resetPasswordConfirm").value;

  if (!nome) return void (message.textContent = "O nome completo é obrigatório.");
  if (!isValidNickname(apelido)) return void (message.textContent = "Nome de usuário inválido. Use 3 a 30 caracteres: letras, números, ponto, hífen ou _.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return void (message.textContent = "Informe um e-mail válido.");
  if (pass1 && pass1.length < 8) return void (message.textContent = "A nova senha deve ter pelo menos 8 caracteres.");
  if (pass1 !== pass2) return void (message.textContent = "As senhas não coincidem.");
  if (userId === state.user.id && !ativo) return void (message.textContent = "Você não pode desativar seu próprio usuário.");

  message.textContent = "Salvando alterações...";

  const emailChanged = email !== String(current.email || "").toLowerCase();
  if (emailChanged || pass1) {
    const credentials = { user_id: userId };
    if (emailChanged) credentials.email = email;
    if (pass1) credentials.password = pass1;
    const { data, error } = await supabase.functions.invoke("admin-reset-password", { body: credentials });
    if (error || data?.error) {
      message.textContent = data?.error || error?.message || "Não foi possível alterar as credenciais.";
      return;
    }
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ nome, apelido, setor, perfil, ativo })
    .eq("id", userId);
  if (profileError) {
    message.textContent = friendlyErrorMessage(profileError);
    return;
  }

  message.className = "form-message success";
  message.textContent = "Alterações salvas com sucesso.";
  const changedOwnRole = userId === state.user.id && perfil !== current.perfil;
  await loadData();
  showToast("Usuário atualizado sem alterar o histórico.");
  setTimeout(() => {
    $("resetPasswordDialog").close();
    if (changedOwnRole) window.location.reload();
  }, 700);
}'''
app, count = re.subn(
    r"function openResetPasswordDialog\(profile\) \{.*?\n\}\n\nasync function submitResetPassword\(event\) \{.*?\n\}\n\nasync function updateUserProfile",
    new_editor + "\n\nasync function updateUserProfile",
    app,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError("editor de usuário não localizado")

old_click = '''    const resetPasswordButton = event.target.closest("[data-reset-password]");
    if (resetPasswordButton) {
      const profile = state.profiles.find((item) => item.id === resetPasswordButton.dataset.resetPassword);
      openResetPasswordDialog(profile);
    }'''
new_click = '''    const editUserButton = event.target.closest("[data-edit-user]");
    if (editUserButton) {
      const profile = state.profiles.find((item) => item.id === editUserButton.dataset.editUser);
      openResetPasswordDialog(profile);
    }'''
if old_click not in app:
    raise RuntimeError("click de edição de usuário não localizado")
app = app.replace(old_click, new_click, 1)

app, count = re.subn(
    r'\n  document\.addEventListener\("change", \(event\) => \{\n    const fullnameInput = event\.target\.closest\("\[data-user-fullname\]"\);.*?\n  \}\);\n',
    "\n",
    app,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError("listener antigo de edição em linha não localizado")

app_path.write_text(app, encoding="utf-8")

html = html_path.read_text(encoding="utf-8")
old_role = '''              <label>Perfil
                <select id="newUserRole"><option value="usuario">Usuário comum</option><option value="marketing">Marketing</option><option value="comercial">Comercial</option><option value="admin">Administrador</option></select>
              </label>'''
new_role = '''              <label>Setor
                <select id="newUserSector"><option>Atendimento</option><option>Administrativo</option><option>Comercial</option><option>Financeiro</option><option>Projetos</option><option>Topografia</option><option>Marketing</option><option>Pós-Protocolo</option></select>
              </label>
              <label>Função / permissão
                <select id="newUserRole"><option value="usuario">Usuário comum</option><option value="marketing">Marketing</option><option value="comercial">Comercial</option><option value="admin">Administrador</option></select>
              </label>'''
if old_role not in html:
    raise RuntimeError("campo Perfil de novo usuário não localizado")
html = html.replace(old_role, new_role, 1)
html = html.replace(
    "Altere apelido, perfil e status diretamente na lista.",
    "Clique em um usuário para editar dados, acesso, setor, função e senha.",
    1,
)
html, count = re.subn(
    r'\n            <div class="users-list-head">.*?</div>\n            <div id="usersList" class="users-table-list"></div>',
    '\n            <div id="usersList" class="user-card-grid"></div>',
    html,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError("lista antiga de usuários não localizada")

new_dialog = '''<dialog id="resetPasswordDialog" class="dialog medium-dialog">
    <form id="resetPasswordForm" class="dialog-body">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">Equipe e acessos</p>
          <h2 id="resetPasswordDialogTitle">Editar usuário</h2>
          <p id="resetPasswordDialogSubtitle" class="muted"></p>
        </div>
        <button type="button" class="icon-button" data-close-dialog="resetPasswordDialog">×</button>
      </div>
      <input type="hidden" id="resetPasswordUserId" />
      <div class="form-grid two">
        <label class="span-two">Nome completo<input id="resetPasswordName" required maxlength="120" /></label>
        <label>Nome de usuário<input id="resetPasswordNickname" required maxlength="30" autocomplete="off" /></label>
        <label>E-mail de acesso<input id="resetPasswordEmail" type="email" required /></label>
        <label>Setor<select id="resetPasswordSector"></select></label>
        <label>Função / permissão
          <select id="resetPasswordRole"><option value="usuario">Usuário</option><option value="comercial">Comercial</option><option value="marketing">Marketing</option><option value="admin">Administrador</option></select>
        </label>
        <label>Status<select id="resetPasswordActive"><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
        <div></div>
        <div class="user-password-section span-two">
          <strong>Alterar senha</strong>
          <p class="muted">Deixe os campos vazios para manter a senha atual.</p>
          <div class="form-grid two user-password-grid">
            <label>Nova senha<input id="resetPasswordNew" type="password" minlength="8" autocomplete="new-password" /></label>
            <label>Confirmar nova senha<input id="resetPasswordConfirm" type="password" minlength="8" autocomplete="new-password" /></label>
          </div>
        </div>
      </div>
      <p id="resetPasswordMessage" class="form-message"></p>
      <div class="dialog-actions">
        <div class="spacer"></div>
        <button type="button" class="secondary" data-close-dialog="resetPasswordDialog">Cancelar</button>
        <button class="primary" type="submit">Salvar alterações</button>
      </div>
    </form>
  </dialog>'''
html, count = re.subn(
    r'<dialog id="resetPasswordDialog".*?</dialog>',
    new_dialog,
    html,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError("dialog antigo de senha não localizado")
html_path.write_text(html, encoding="utf-8")

css = css_path.read_text(encoding="utf-8")
if "/* ---------- usuários: cards no padrão do ERP ---------- */" not in css:
    css += r'''

/* ---------- usuários: cards no padrão do ERP ---------- */
.user-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
  gap: 16px;
  align-items: stretch;
}
.user-admin-card {
  width: 100%;
  min-height: 154px;
  padding: 18px 18px 16px;
  text-align: left;
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: #fff;
  overflow: hidden;
  transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
}
.user-admin-card:hover {
  transform: translateY(-2px);
  border-color: rgba(15, 95, 91, .32);
  box-shadow: 0 14px 32px rgba(15, 95, 91, .14);
}
.user-admin-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
}
.user-admin-card-head > div { min-width: 0; flex: 1 1 auto; }
.user-admin-card-head strong {
  display: block;
  font-size: 16px;
  line-height: 1.22;
  color: #111;
  overflow-wrap: anywhere;
}
.user-admin-card-head .muted {
  display: block;
  margin-top: 4px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-admin-card-meta {
  display: grid;
  gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #edf3f2;
  font-size: 13px;
  line-height: 1.3;
}
.user-admin-card-meta span { min-width: 0; overflow-wrap: anywhere; }
.user-admin-card-meta b { color: var(--text); }
.user-password-section {
  margin-top: 4px;
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}
.user-password-section > strong { display: block; }
.user-password-section > p { margin: 3px 0 12px; }
.user-password-grid { margin-top: 10px; }
@media (max-width: 720px) {
  .user-card-grid { grid-template-columns: 1fr; }
  .user-admin-card { min-height: auto; }
}
'''
css_path.write_text(css, encoding="utf-8")

config = config_path.read_text(encoding="utf-8")
config = config.replace('\n\nimport("./users-admin.js");\n', '\n')
config_path.write_text(config, encoding="utf-8")

build = build_path.read_text(encoding="utf-8")
build = build.replace('["index.html", "style.css", "app.js", "users-admin.js"]', '["index.html", "style.css", "app.js"]')
build = build.replace('};\\n\\nimport("./users-admin.js");\\n`;', '};\\n`;')
build_path.write_text(build, encoding="utf-8")

module = root / "users-admin.js"
if module.exists():
    module.unlink()

workflow = repo_root / ".github" / "workflows" / "refactor-users-direct.yml"
if workflow.exists():
    workflow.unlink()

Path(__file__).unlink()
