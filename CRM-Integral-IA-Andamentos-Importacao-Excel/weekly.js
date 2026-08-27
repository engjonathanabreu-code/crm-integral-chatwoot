import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CONFIG = window.CRM_CONFIG || {};
if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
  console.warn("Gestão semanal: Supabase não configurado.");
} else {
  const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const qs = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
  const toast = (message, type = "ok") => {
    const el = qs("toast");
    if (!el) return;
    el.textContent = message;
    el.className = `toast ${type === "error" ? "error" : "success"}`;
    setTimeout(() => el.classList.add("hidden"), 3200);
  };

  const weekly = {
    user: null,
    profile: null,
    municipalities: [],
    projects: [],
    weeks: [],
    records: [],
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    activeWeek: null,
    activeMunicipality: null,
  };

  function canUse(profile) {
    return !!profile && profile.ativo !== false && (profile.perfil === "admin" || profile.setor === "Pós-Protocolo");
  }

  function ensureUi() {
    if (qs("weeklyMunicipalitiesNav")) return;
    const anchor = document.querySelector('[data-view="andamentos"]');
    if (!anchor) return;

    const nav = document.createElement("button");
    nav.id = "weeklyMunicipalitiesNav";
    nav.className = "nav-button";
    nav.dataset.view = "gestao-semanal";
    nav.innerHTML = "<span>Gestão Semanal</span>";
    anchor.insertAdjacentElement("afterend", nav);

    const main = document.querySelector("main.main-content");
    if (!main) return;
    const section = document.createElement("section");
    section.id = "gestao-semanal";
    section.className = "view weekly-view";
    section.innerHTML = `
      <div class="section-head weekly-head">
        <div>
          <p class="eyebrow">Pós-Protocolo</p>
          <h2>Gestão semanal de municípios</h2>
          <p class="muted">Acompanhamento semanal dos municípios, com vínculo opcional aos Projetos/Núcleos e aos respectivos Andamentos.</p>
        </div>
        <button id="weeklyNewMunicipality" class="primary" type="button">+ Município</button>
      </div>
      <div class="weekly-toolbar">
        <label>Ano<select id="weeklyYear"></select></label>
        <label>Mês<select id="weeklyMonth"></select></label>
        <label class="weekly-search-label">Buscar<input id="weeklySearch" type="search" placeholder="Município, projeto ou estado"></label>
        <button id="weeklyRefresh" class="secondary" type="button">Atualizar</button>
      </div>
      <div id="weeklySummary" class="weekly-summary"></div>
      <div id="weeklyGrid" class="weekly-grid"></div>
    `;
    main.appendChild(section);

    document.body.insertAdjacentHTML("beforeend", `
      <dialog id="weeklyMunicipalityDialog" class="dialog">
        <form id="weeklyMunicipalityForm" method="dialog">
          <div class="dialog-body">
            <div class="dialog-head"><div><p class="eyebrow">Pós-Protocolo</p><h2 id="weeklyMunicipalityTitle">Novo município</h2></div><button type="button" class="icon-button" data-weekly-close="weeklyMunicipalityDialog">×</button></div>
            <input id="weeklyMunicipalityId" type="hidden">
            <div class="form-grid">
              <label class="full">Vincular a Projeto / Núcleo<select id="weeklyProject"><option value="">Sem vínculo</option></select></label>
              <label>Município<input id="weeklyMunicipalityName" required></label>
              <label>UF<input id="weeklyMunicipalityState" maxlength="2" required placeholder="SC"></label>
              <label>Telefone<input id="weeklyMunicipalityPhone" placeholder="(47) 0000-0000"></label>
              <label class="full">Observações<textarea id="weeklyMunicipalityNotes" rows="3"></textarea></label>
            </div>
            <div class="dialog-actions"><button type="button" class="secondary" data-weekly-close="weeklyMunicipalityDialog">Cancelar</button><button class="primary" type="submit">Salvar</button></div>
          </div>
        </form>
      </dialog>

      <dialog id="weeklyWeekDialog" class="dialog large-dialog">
        <div class="dialog-body">
          <div class="dialog-head"><div><p class="eyebrow">Gestão semanal</p><h2 id="weeklyWeekTitle">Semana</h2><p id="weeklyWeekSubtitle" class="muted"></p></div><button type="button" class="icon-button" data-weekly-close="weeklyWeekDialog">×</button></div>
          <div id="weeklyWeekStatus" class="weekly-week-status"></div>
          <form id="weeklyRecordForm" class="weekly-record-form">
            <label class="full">Registro da semana<textarea id="weeklyRecordComment" rows="3" required placeholder="Informe o contato, retorno, pendência ou providência desta semana."></textarea></label>
            <div class="dialog-actions"><button id="weeklyToggleDone" class="secondary" type="button">Concluir semana</button><button class="primary" type="submit">Adicionar registro</button></div>
          </form>
          <div id="weeklyRecordsList" class="weekly-records-list"></div>
        </div>
      </dialog>
    `);

    nav.addEventListener("click", openWeeklyView);
    qs("weeklyNewMunicipality").addEventListener("click", () => openMunicipalityDialog());
    qs("weeklyRefresh").addEventListener("click", loadWeeklyData);
    qs("weeklySearch").addEventListener("input", renderWeekly);
    qs("weeklyYear").addEventListener("change", async (e) => { weekly.year = Number(e.target.value); await loadWeeklyData(); });
    qs("weeklyMonth").addEventListener("change", async (e) => { weekly.month = Number(e.target.value); await loadWeeklyData(); });
    qs("weeklyProject").addEventListener("change", syncProjectLocation);
    qs("weeklyMunicipalityForm").addEventListener("submit", saveMunicipality);
    qs("weeklyRecordForm").addEventListener("submit", saveRecord);
    qs("weeklyToggleDone").addEventListener("click", toggleWeekDone);
    document.addEventListener("click", handleWeeklyClick);

    const current = new Date().getFullYear();
    qs("weeklyYear").innerHTML = Array.from({ length: 5 }, (_, i) => current - 2 + i).map((y) => `<option value="${y}" ${y === weekly.year ? "selected" : ""}>${y}</option>`).join("");
    qs("weeklyMonth").innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === weekly.month ? "selected" : ""}>${m}</option>`).join("");
  }

  function openWeeklyView() {
    document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === "gestao-semanal"));
    document.querySelectorAll(".nav-button").forEach((el) => el.classList.toggle("active", el.id === "weeklyMunicipalitiesNav"));
    if (qs("pageEyebrow")) qs("pageEyebrow").textContent = "Pós-Protocolo";
    if (qs("pageTitle")) qs("pageTitle").textContent = "Gestão Semanal";
    if (qs("pageDescription")) qs("pageDescription").textContent = "Acompanhamento semanal dos municípios vinculados aos projetos e andamentos.";
    loadWeeklyData();
  }

  async function loadWeeklyData() {
    if (!weekly.user) return;
    const [{ data: municipalities, error: mErr }, { data: projects, error: pErr }, { data: weeks, error: wErr }] = await Promise.all([
      db.from("pos_protocolo_municipios").select("*").eq("ativo", true).order("nome"),
      db.from("projetos").select("id,nome,cidade,estado,ativo").order("cidade").order("nome"),
      db.from("pos_protocolo_semanas").select("*").eq("ano", weekly.year).eq("mes", weekly.month),
    ]);
    const error = mErr || pErr || wErr;
    if (error) return toast(`Gestão semanal: ${error.message}`, "error");
    weekly.municipalities = municipalities || [];
    weekly.projects = projects || [];
    weekly.weeks = weeks || [];

    const weekIds = weekly.weeks.map((w) => w.id);
    weekly.records = [];
    if (weekIds.length) {
      const { data, error: rErr } = await db.from("pos_protocolo_registros").select("*").in("semana_id", weekIds).order("created_at", { ascending: false });
      if (rErr) return toast(rErr.message, "error");
      weekly.records = data || [];
    }
    fillProjectOptions();
    renderWeekly();
  }

  function fillProjectOptions() {
    const select = qs("weeklyProject");
    if (!select) return;
    const value = select.value;
    select.innerHTML = `<option value="">Sem vínculo</option>${weekly.projects.map((p) => `<option value="${p.id}">${esc(p.cidade)}/${esc(p.estado)} — ${esc(p.nome)}</option>`).join("")}`;
    select.value = value;
  }

  function weekFor(municipioId, weekNo) {
    return weekly.weeks.find((w) => w.municipio_id === municipioId && w.semana === weekNo);
  }

  function recordsFor(weekId) {
    return weekId ? weekly.records.filter((r) => r.semana_id === weekId) : [];
  }

  function renderWeekly() {
    const grid = qs("weeklyGrid");
    if (!grid) return;
    const search = (qs("weeklySearch")?.value || "").trim().toLowerCase();
    const filtered = weekly.municipalities.filter((m) => {
      const p = weekly.projects.find((x) => x.id === m.projeto_id);
      return !search || [m.nome, m.estado, p?.nome, p?.cidade].join(" ").toLowerCase().includes(search);
    });

    const totalWeeks = filtered.length * 4;
    const doneWeeks = filtered.reduce((sum, m) => sum + [1,2,3,4].filter((n) => weekFor(m.id, n)?.concluido).length, 0);
    qs("weeklySummary").innerHTML = `
      <div><strong>${filtered.length}</strong><span>município(s)</span></div>
      <div><strong>${doneWeeks}</strong><span>semana(s) concluída(s)</span></div>
      <div><strong>${Math.max(totalWeeks - doneWeeks, 0)}</strong><span>semana(s) pendente(s)</span></div>
    `;

    if (!filtered.length) {
      grid.innerHTML = `<div class="empty-state">Nenhum município cadastrado para a gestão semanal.</div>`;
      return;
    }

    grid.innerHTML = filtered.map((m) => {
      const project = weekly.projects.find((p) => p.id === m.projeto_id);
      const weeks = [1,2,3,4].map((n) => {
        const w = weekFor(m.id, n);
        const count = recordsFor(w?.id).length;
        return `<button type="button" class="weekly-week ${w?.concluido ? "done" : "pending"}" data-weekly-open="${m.id}" data-week="${n}">
          <span>Semana ${n}</span><strong>${w?.concluido ? "Concluída" : "Pendente"}</strong><small>${count} registro(s)</small>
        </button>`;
      }).join("");
      return `<article class="weekly-municipality-card">
        <div class="weekly-municipality-head">
          <div><h3>${esc(m.nome)}/${esc(m.estado)}</h3><p class="muted">${project ? `Vinculado: ${esc(project.nome)}` : "Sem projeto vinculado"}</p></div>
          <button type="button" class="secondary small-button" data-weekly-edit="${m.id}">Editar</button>
        </div>
        ${m.observacoes ? `<p class="weekly-notes">${esc(m.observacoes)}</p>` : ""}
        <div class="weekly-weeks">${weeks}</div>
      </article>`;
    }).join("");
  }

  function openMunicipalityDialog(id = null) {
    const m = weekly.municipalities.find((x) => x.id === id);
    qs("weeklyMunicipalityForm").reset();
    qs("weeklyMunicipalityId").value = m?.id || "";
    qs("weeklyMunicipalityTitle").textContent = m ? "Editar município" : "Novo município";
    fillProjectOptions();
    if (m) {
      qs("weeklyProject").value = m.projeto_id || "";
      qs("weeklyMunicipalityName").value = m.nome || "";
      qs("weeklyMunicipalityState").value = m.estado || "";
      qs("weeklyMunicipalityPhone").value = m.telefone || "";
      qs("weeklyMunicipalityNotes").value = m.observacoes || "";
    }
    qs("weeklyMunicipalityDialog").showModal();
  }

  function syncProjectLocation() {
    const project = weekly.projects.find((p) => p.id === qs("weeklyProject").value);
    if (!project) return;
    qs("weeklyMunicipalityName").value = project.cidade || "";
    qs("weeklyMunicipalityState").value = project.estado || "";
  }

  async function saveMunicipality(event) {
    event.preventDefault();
    const id = qs("weeklyMunicipalityId").value;
    const payload = {
      projeto_id: qs("weeklyProject").value || null,
      nome: qs("weeklyMunicipalityName").value.trim(),
      estado: qs("weeklyMunicipalityState").value.trim().toUpperCase(),
      telefone: qs("weeklyMunicipalityPhone").value.trim() || null,
      observacoes: qs("weeklyMunicipalityNotes").value.trim() || null,
    };
    let result;
    if (id) result = await db.from("pos_protocolo_municipios").update(payload).eq("id", id);
    else result = await db.from("pos_protocolo_municipios").insert({ ...payload, created_by: weekly.user.id });
    if (result.error) return toast(result.error.message, "error");
    qs("weeklyMunicipalityDialog").close();
    await loadWeeklyData();
    toast("Município salvo.");
  }

  async function getOrCreateWeek(municipioId, weekNo) {
    let row = weekFor(municipioId, weekNo);
    if (row) return row;
    const { data, error } = await db.from("pos_protocolo_semanas").insert({
      municipio_id: municipioId, ano: weekly.year, mes: weekly.month, semana: weekNo, created_by: weekly.user.id,
    }).select("*").single();
    if (error) throw error;
    weekly.weeks.push(data);
    return data;
  }

  async function openWeekDialog(municipioId, weekNo) {
    try {
      const municipality = weekly.municipalities.find((m) => m.id === municipioId);
      if (!municipality) return;
      const week = await getOrCreateWeek(municipioId, Number(weekNo));
      weekly.activeWeek = week;
      weekly.activeMunicipality = municipality;
      qs("weeklyWeekTitle").textContent = `${municipality.nome}/${municipality.estado} — Semana ${week.semana}`;
      qs("weeklyWeekSubtitle").textContent = `${MONTHS[week.mes - 1]} de ${week.ano}`;
      renderWeekDialog();
      qs("weeklyWeekDialog").showModal();
    } catch (error) { toast(error.message, "error"); }
  }

  function renderWeekDialog() {
    const week = weekly.activeWeek;
    if (!week) return;
    const records = recordsFor(week.id);
    qs("weeklyWeekStatus").innerHTML = `<span class="weekly-status-pill ${week.concluido ? "done" : "pending"}">${week.concluido ? "Semana concluída" : "Semana pendente"}</span>`;
    qs("weeklyToggleDone").textContent = week.concluido ? "Reabrir semana" : "Concluir semana";
    qs("weeklyRecordsList").innerHTML = records.length ? records.map((r) => `<article class="weekly-record"><p>${esc(r.comentario)}</p><small>${new Date(r.created_at).toLocaleString("pt-BR")}</small></article>`).join("") : `<div class="empty-state">Nenhum registro nesta semana.</div>`;
  }

  async function saveRecord(event) {
    event.preventDefault();
    if (!weekly.activeWeek || !weekly.activeMunicipality) return;
    const comentario = qs("weeklyRecordComment").value.trim();
    if (!comentario) return;
    const { data, error } = await db.from("pos_protocolo_registros").insert({
      semana_id: weekly.activeWeek.id,
      municipio_id: weekly.activeMunicipality.id,
      comentario,
      created_by: weekly.user.id,
    }).select("*").single();
    if (error) return toast(error.message, "error");
    weekly.records.unshift(data);
    qs("weeklyRecordComment").value = "";
    renderWeekDialog();
    renderWeekly();
    toast("Registro adicionado.");
  }

  async function toggleWeekDone() {
    const week = weekly.activeWeek;
    if (!week) return;
    const concluded = !week.concluido;
    const { data, error } = await db.from("pos_protocolo_semanas").update({
      concluido: concluded,
      concluido_em: concluded ? new Date().toISOString() : null,
      concluido_por: concluded ? weekly.user.id : null,
    }).eq("id", week.id).select("*").single();
    if (error) return toast(error.message, "error");
    const idx = weekly.weeks.findIndex((w) => w.id === data.id);
    if (idx >= 0) weekly.weeks[idx] = data;
    weekly.activeWeek = data;
    renderWeekDialog();
    renderWeekly();
    toast(concluded ? "Semana concluída." : "Semana reaberta.");
  }

  function handleWeeklyClick(event) {
    const close = event.target.closest("[data-weekly-close]");
    if (close) { qs(close.dataset.weeklyClose)?.close(); return; }
    const edit = event.target.closest("[data-weekly-edit]");
    if (edit) { openMunicipalityDialog(edit.dataset.weeklyEdit); return; }
    const open = event.target.closest("[data-weekly-open]");
    if (open) openWeekDialog(open.dataset.weeklyOpen, open.dataset.week);
  }

  async function activateForUser(user) {
    weekly.user = user;
    if (!user) {
      qs("weeklyMunicipalitiesNav")?.remove();
      qs("gestao-semanal")?.remove();
      return;
    }
    const { data: profile, error } = await db.from("profiles").select("id,perfil,setor,ativo").eq("id", user.id).maybeSingle();
    if (error || !canUse(profile)) return;
    weekly.profile = profile;
    ensureUi();
  }

  db.auth.getSession().then(({ data }) => activateForUser(data.session?.user || null));
  db.auth.onAuthStateChange((_event, session) => { setTimeout(() => activateForUser(session?.user || null), 0); });
}
