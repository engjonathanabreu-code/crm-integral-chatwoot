import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "dist");
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "COLE_AQUI_A_PROJECT_URL";
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "COLE_AQUI_A_PUBLISHABLE_KEY";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Não foi possível aplicar ajuste: ${label}.`);
  return source.replace(before, after);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const file of ["style.css", "app.js", "weekly.css", "weekly.js", "weekly-approvals.js"]) {
  await cp(resolve(root, file), resolve(out, file));
}

let app = await readFile(resolve(out, "app.js"), "utf8");

// A importação em massa deve usar o mesmo Status do card de cliente.
app = replaceRequired(
  app,
  '    status: "Cliente Ativo",',
  '    status: $("clientImportStatus")?.value || "Cliente Ativo",',
  "status configurável na importação"
);

// O Funil Comercial deve exibir oportunidades com valor informado mesmo sem Comercial atribuído.
app = replaceRequired(
  app,
  '    return client.status !== "Cliente Ativo" && clientHasComercial(client) && (!search || haystack.includes(search)) && (!owner || client.owner_id === owner) && (!comercial || clientComercialIds(client).includes(comercial));',
  '    return client.status !== "Cliente Ativo" && (clientHasComercial(client) || Number(client.valor_estimado || 0) > 0) && (!search || haystack.includes(search)) && (!owner || client.owner_id === owner) && (!comercial || clientComercialIds(client).includes(comercial));',
  "regra do Funil Comercial"
);

// Mensagens de erro precisam ficar legíveis mesmo com um dialog aberto. Um <dialog>
// vive na top-layer do navegador, portanto z-index do toast global não consegue ficar
// por cima dele. Quando houver dialog ativo, mostramos a mensagem dentro do próprio dialog.
app = replaceRequired(
  app,
`function showToast(message, type = "success") {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = \`toast \${type}\`;
  setTimeout(() => toast.classList.add("hidden"), 3500);
}`,
`function showToast(message, type = "success") {
  const activeDialog = document.querySelector("dialog[open]");
  if (activeDialog) {
    const body = activeDialog.querySelector(".dialog-body") || activeDialog;
    let inline = activeDialog.querySelector(".dialog-toast");
    if (!inline) {
      inline = document.createElement("div");
      inline.className = "dialog-toast hidden";
      body.prepend(inline);
    }
    inline.textContent = message;
    inline.className = \`dialog-toast \${type}\`;
    clearTimeout(inline.__hideTimer);
    inline.__hideTimer = setTimeout(() => inline.classList.add("hidden"), 5000);
    return;
  }
  const toast = $("toast");
  toast.textContent = message;
  toast.className = \`toast \${type}\`;
  clearTimeout(toast.__hideTimer);
  toast.__hideTimer = setTimeout(() => toast.classList.add("hidden"), 4200);
}`,
  "erros visíveis em dialogs"
);

// Usuários do Comercial também podem atribuir agentes/atendentes aos clientes.
app = replaceRequired(
  app,
`function canManageAssignedAgents(existingClient) {
  if (isAdmin()) return true;
  if (!existingClient) return true;
  return existingClient.created_by === state.user.id;
}`,
`function canManageAssignedAgents(existingClient) {
  if (isAdmin()) return true;
  const isCommercialUser = state.profile?.perfil === "comercial" || String(state.profile?.setor || "").toLowerCase() === "comercial";
  if (isCommercialUser) return true;
  if (!existingClient) return true;
  return existingClient.created_by === state.user.id;
}`,
  "Comercial pode atribuir agentes"
);

// Evita herdar o Código do Processo (e Estado Civil) do cliente editado anteriormente.
app = replaceRequired(
  app,
`  $("clientShipment").value = client.remessa || "";
  $("clientSource").value = client.origem || "Indicação";`,
`  $("clientShipment").value = client.remessa || "";
  if ($("clientProcessCode")) $("clientProcessCode").value = client.codigo_processo || "";
  if ($("clientCivilStatus")) $("clientCivilStatus").value = client.estado_civil || "";
  $("clientSource").value = client.origem || "Indicação";`,
  "limpeza do código ao alternar clientes"
);

// Município manual para importação: se não houver projeto reconhecido/selecionado,
// usa o município escolhido ou digitado sem obrigar a criação de NUI.
app = replaceRequired(
  app,
`function importProjectData() {
  // Projeto/NUI escolhido manualmente no passo 2 — usado como reserva quando
  // o prefixo do Código do Processo da linha não bate com nenhuma sigla cadastrada.
  return projectDataFrom(projectById($("clientImportProject")?.value || ""));
}`,
`function importProjectData() {
  const project = projectById($("clientImportProject")?.value || "");
  if (project) return projectDataFrom(project);

  const selected = $("clientImportMunicipality")?.value || "";
  const [selectedCity = "", selectedState = ""] = selected.split("|");
  const typedCity = $("clientImportMunicipalityNew")?.value.trim() || "";
  const typedState = $("clientImportState")?.value.trim().toUpperCase() || "";
  const municipio = canonicalCityName(typedCity || selectedCity) || null;
  const estado = typedCity ? (typedState || null) : (selectedState || typedState || null);
  return { projeto_id: null, estado, municipio, nucleo: null };
}`,
  "município manual na importação"
);

app = replaceRequired(
  app,
`  if ($("clientImportProject")) $("clientImportProject").innerHTML = \`<option value="">Sem NUI — vincular depois</option>\${projectOptions}\`;
  if ($("progressProject")) $("progressProject").innerHTML = \`<option value="">Selecione um projeto</option>\${projectOptions}\`;`,
`  if ($("clientImportProject")) $("clientImportProject").innerHTML = \`<option value="">Sem NUI — vincular depois</option>\${projectOptions}\`;

  if ($("clientImportMunicipality")) {
    const municipalityMap = new Map();
    state.projects.forEach((project) => {
      const city = String(project.cidade || "").trim();
      const uf = String(project.estado || "").trim().toUpperCase();
      if (city) municipalityMap.set(normalizeCityKey(city), { city, uf });
    });
    state.clients.forEach((client) => {
      const city = String(client.municipio || "").trim();
      const uf = String(client.estado || "").trim().toUpperCase();
      if (city && !municipalityMap.has(normalizeCityKey(city))) municipalityMap.set(normalizeCityKey(city), { city, uf });
    });
    const municipalityOptions = [...municipalityMap.values()]
      .sort((a, b) => a.city.localeCompare(b.city, "pt-BR"))
      .map((item) => \`<option value="\${escapeHtml(item.city)}|\${escapeHtml(item.uf)}">\${escapeHtml(item.city)}\${item.uf ? \`/\${escapeHtml(item.uf)}\` : ""}</option>\`)
      .join("");
    $("clientImportMunicipality").innerHTML = \`<option value="">Selecionar município existente</option>\${municipalityOptions}\`;
  }

  if ($("progressProject")) $("progressProject").innerHTML = \`<option value="">Selecione um projeto</option>\${projectOptions}\`;`,
  "lista de municípios da importação"
);

app = replaceRequired(
  app,
`  $("clientImportFile").value = "";
  $("clientImportRun").disabled = true;`,
`  $("clientImportFile").value = "";
  if ($("clientImportProject")) $("clientImportProject").value = "";
  if ($("clientImportMunicipality")) $("clientImportMunicipality").value = "";
  if ($("clientImportMunicipalityNew")) $("clientImportMunicipalityNew").value = "";
  if ($("clientImportState")) $("clientImportState").value = "";
  $("clientImportRun").disabled = true;`,
  "limpeza do município da importação"
);

app = replaceRequired(
  app,
`  $("clientImportProject").addEventListener("change", () => { if (state.importRows.length) renderClientImportPreview(); });
  $("clientImportRun").addEventListener("click", runClientImport);`,
`  $("clientImportProject").addEventListener("change", () => { if (state.importRows.length) renderClientImportPreview(); });
  ["clientImportMunicipality", "clientImportMunicipalityNew", "clientImportState"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener(id === "clientImportMunicipality" ? "change" : "input", () => {
      if (id === "clientImportMunicipality" && el.value && $("clientImportProject")) $("clientImportProject").value = "";
      if (id === "clientImportMunicipalityNew" && el.value && $("clientImportProject")) $("clientImportProject").value = "";
      if (state.importRows.length) renderClientImportPreview();
    });
  });
  $("clientImportRun").addEventListener("click", runClientImport);`,
  "eventos do município da importação"
);

await writeFile(resolve(out, "app.js"), app, "utf8");

let index = await readFile(resolve(root, "index.html"), "utf8");

index = replaceRequired(
  index,
`          <label>Projeto / NUI (reserva, se o prefixo do código não for reconhecido)
            <select id="clientImportProject"><option value="">Sem NUI — vincular depois</option></select>
          </label>
          <p class="muted small-note">O CRM identifica o prefixo do Código do Processo de cada linha (ex.: GTB01 em GTB01_0386) e preenche projeto, município, estado e núcleo automaticamente. Se um prefixo não tiver projeto cadastrado com essa sigla, é usado o Projeto/NUI selecionado aqui.</p>`,
`          <label>Projeto / NUI (opcional)
            <select id="clientImportProject"><option value="">Sem NUI — vincular depois</option></select>
          </label>
          <div class="import-municipality-fields">
            <label>Município de reserva
              <select id="clientImportMunicipality"><option value="">Selecionar município existente</option></select>
            </label>
            <label>Novo município
              <input id="clientImportMunicipalityNew" placeholder="Ex.: Ibirama" autocomplete="off" />
            </label>
            <label>UF
              <input id="clientImportState" maxlength="2" placeholder="SC" autocomplete="off" />
            </label>
          </div>
          <p class="muted small-note">Primeiro o CRM tenta reconhecer o prefixo do Código do Processo. Se não reconhecer, usa o Projeto/NUI selecionado; sem NUI, usa o município escolhido ou digitado aqui. Assim a planilha pode ser importada mesmo sem coluna de município.</p>`,
  "campos de município na importação"
);

index = index.replace(
  "Editável manualmente só por Admin ou por quem cadastrou o cliente.",
  "Editável manualmente por Admin, usuários do Comercial ou por quem cadastrou o cliente."
);

// Padroniza Dono do registro, Comercial e Agentes atribuídos como seletores compactos.
if (!index.includes('client-mini-select')) {
  index = replaceRequired(
    index,
  `        <label class="admin-only hidden">Dono do registro<select id="clientOwner"></select></label>
          <label>Comercial<select id="clientComercial"><option value="">Sem comercial atribuído</option></select>
            <small class="field-help">Admin, usuários do Comercial ou quem cadastrou o cliente podem atribuir/trocar o Comercial.</small>
          </label>
          <label class="span-two">Agentes atribuídos<select id="clientAgentsAssigned" multiple size="4"></select>
            <small class="field-help">Cresce sozinho quando um agente registra um Atendimento (o agente + o Comercial entram na lista). Editável manualmente por Admin, usuários do Comercial ou por quem cadastrou o cliente.</small>
          </label>`,
  `        <label class="admin-only hidden client-assignment-field">Dono do registro
            <select id="clientOwner" class="client-mini-select"></select>
          </label>
          <label class="client-assignment-field">Comercial
            <select id="clientComercial" class="client-mini-select"><option value="">Sem comercial atribuído</option></select>
            <small class="field-help">Admin, usuários do Comercial ou quem cadastrou o cliente podem atribuir/trocar o Comercial.</small>
          </label>
          <label class="client-assignment-field">Agentes atribuídos
            <select id="clientAgentsAssigned" class="client-mini-select client-agents-select" multiple size="1"></select>
            <small class="field-help">Permite vários agentes. Clique no campo para abrir a lista; as atribuições automáticas continuam funcionando.</small>
          </label>`,
    "seletores compactos do cliente"
  );
}

const importStatusCard = `
        <article class="panel flat">
          <p class="eyebrow">4. Status</p>
          <h3>Status dos clientes</h3>
          <label>Status aplicado a esta importação
            <select id="clientImportStatus">
              <option>Novo</option>
              <option>Contato feito</option>
              <option>Proposta enviada</option>
              <option>Negociação</option>
              <option selected>Cliente Ativo</option>
              <option>Perdido</option>
            </select>
          </label>
          <p class="muted small-note">O status escolhido será aplicado a todos os clientes desta importação, inclusive aos registros atualizados quando o modo permitir atualização.</p>
        </article>`;
const importGridEnd = `        </article>\n      </div>\n\n      <div id="clientImportSummary"`;
index = replaceRequired(
  index,
  importGridEnd,
  `        </article>${importStatusCard}\n      </div>\n\n      <div id="clientImportSummary"`,
  "card de status da importação"
);
index = index.replace("</head>", '  <link rel="stylesheet" href="./weekly.css">\n</head>');

const weeklyLoader = `
  <script type="module">
    (() => {
      let timer = null;
      const loadWeeklyModules = async () => {
        if (window.__crmWeeklyModulesLoaded) {
          if (timer) clearInterval(timer);
          return;
        }

        const shell = document.getElementById("appShell");
        const sync = document.getElementById("syncStatus");
        const coreReady = shell && !shell.classList.contains("hidden") && sync?.textContent?.trim() === "Sincronizado";
        if (!coreReady) return;

        window.__crmWeeklyModulesLoaded = true;
        if (timer) clearInterval(timer);

        try {
          await import("./weekly.js");
          await import("./weekly-approvals.js");
        } catch (error) {
          window.__crmWeeklyModulesLoaded = false;
          console.error("Falha ao iniciar Gestão Semanal:", error);
        }
      };

      window.addEventListener("load", () => {
        loadWeeklyModules();
        timer = setInterval(loadWeeklyModules, 500);
      }, { once: true });
    })();
  </script>`;

index = index.replace("</body>", `${weeklyLoader}\n</body>`);
await writeFile(resolve(out, "index.html"), index, "utf8");

let style = await readFile(resolve(out, "style.css"), "utf8");
style += `

/* ===== CRM 2026-08 — refinamento de clientes e mensagens ===== */
.dialog-toast {
  position: sticky;
  top: 8px;
  z-index: 40;
  margin: -6px 0 14px;
  padding: 11px 14px;
  border: 1px solid rgba(255,255,255,.22);
  border-radius: 10px;
  color: #fff;
  background: var(--nav);
  box-shadow: 0 12px 28px rgba(20,24,28,.18);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.4;
}
.dialog-toast.error { background: var(--danger); }
.dialog-toast.success { background: var(--success); }

#clientFormDialog { width: min(820px, 96vw); }
#clientFormDialog .dialog-body { padding: 20px 22px; }
#clientFormDialog .dialog-head { margin-bottom: 14px; padding-bottom: 13px; }
#clientFormDialog .form-grid.two { gap: 10px 12px; align-items: start; }
#clientFormDialog label { gap: 5px; color: #596069; font-size: 11.5px; font-weight: 650; letter-spacing: .005em; }
#clientFormDialog input,
#clientFormDialog select,
#clientFormDialog textarea {
  min-height: 38px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12.6px;
}
#clientFormDialog textarea { min-height: 72px; }
#clientFormDialog .field-help { margin-top: 2px; font-size: 10.5px; line-height: 1.35; }
#clientFormDialog .dialog-actions { margin-top: 14px; padding-top: 13px; }

/* Responsáveis: todos usam a mesma linguagem visual de mini-menu. */
#clientFormDialog .client-assignment-field {
  align-self: start;
  min-width: 0;
}
#clientFormDialog .client-mini-select {
  width: 100%;
  height: 38px;
  min-height: 38px;
  padding: 7px 34px 7px 10px;
  border: 1px solid #dfe3e5;
  border-radius: 8px;
  background-color: #fff;
  color: #25292e;
  font-size: 12.4px;
  font-weight: 600;
  line-height: 1.2;
}
#clientFormDialog .client-mini-select:disabled {
  color: #747b82;
  background: #f5f6f6;
}
#clientFormDialog .client-agents-select {
  display: block;
  height: 38px;
  min-height: 38px;
  overflow: hidden;
  padding: 5px 9px;
  font-weight: 500;
  transition: height .14s ease, box-shadow .14s ease, border-color .14s ease;
}
#clientFormDialog .client-agents-select:focus {
  position: relative;
  z-index: 8;
  height: 132px;
  min-height: 132px;
  overflow-y: auto;
  border-color: var(--primary);
  background: #fff;
  box-shadow: 0 0 0 3px var(--primary-soft), 0 12px 26px rgba(20,24,28,.09);
}
#clientFormDialog .client-agents-select option {
  padding: 7px 9px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}
#clientFormDialog .client-agents-select option:checked {
  color: var(--primary-dark);
  background: var(--primary-soft);
  font-weight: 650;
}

.client-row {
  padding: 10px 12px;
  border-color: #e5e8e8;
  background: #fff;
  box-shadow: 0 1px 2px rgba(20,24,28,.025);
}
.client-row:hover { transform: translateY(-1px); box-shadow: 0 7px 18px rgba(20,24,28,.055); }
.client-row strong { font-size: 12.6px; line-height: 1.3; }
.client-row span { font-size: 10.5px; }
.nucleus-group > summary { min-height: 38px; }

#clientDetailDialog .dialog-head h2 { font-size: 19px; }
#clientDetailDialog .detail-metrics article { padding: 11px 13px; }
#clientDetailDialog .detail-metrics strong { font-size: 13.5px; }
#clientDetailDialog .detail-data { gap: 0 24px; }
#clientDetailDialog .detail-data-row { padding: 8px 0; font-size: 12px; }
#clientDetailDialog .detail-data-row strong { max-width: 58%; text-align: right; font-weight: 600; }
#clientDetailDialog .detail-actions-column .panel { padding: 15px; }
#clientDetailDialog .compact-form label { font-size: 11.5px; }
#clientDetailDialog .compact-form input,
#clientDetailDialog .compact-form select,
#clientDetailDialog .compact-form textarea { padding: 8px 9px; font-size: 12.2px; }

.import-municipality-fields {
  display: grid;
  grid-template-columns: minmax(0,1.35fr) minmax(0,1fr) 72px;
  gap: 8px;
  margin-top: 9px;
}
.import-municipality-fields label { font-size: 11.3px; }
.import-municipality-fields input,
.import-municipality-fields select { padding: 8px 9px; font-size: 12px; }

@media (max-width: 720px) {
  .import-municipality-fields { grid-template-columns: 1fr; }
  #clientFormDialog .form-grid.two { grid-template-columns: 1fr; }
  #clientFormDialog .span-two { grid-column: auto; }
}
`;
await writeFile(resolve(out, "style.css"), style, "utf8");

const config = `window.CRM_CONFIG = ${JSON.stringify({
  supabaseUrl: url,
  supabaseAnonKey: key,
}, null, 2)};\n`;
await writeFile(resolve(out, "config.js"), config, "utf8");

if (url.includes("COLE_AQUI") || key.includes("COLE_AQUI")) {
  console.warn("AVISO: variáveis do Supabase não definidas. Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY na Vercel.");
}
