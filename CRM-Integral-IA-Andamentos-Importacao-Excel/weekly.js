import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CONFIG = window.CRM_CONFIG || {};
if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) {
  const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const qs = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const state = { user:null, profile:null, municipalities:[], projects:[], progresses:[], weeks:[], records:[], files:[], year:new Date().getFullYear(), month:new Date().getMonth()+1, activeMunicipality:null, activeWeek:null };

  const toast = (message, type="success") => {
    const el = qs("toast"); if (!el) return;
    el.textContent = message; el.className = `toast ${type}`;
    setTimeout(() => el.classList.add("hidden"), 3500);
  };
  const canUse = (p) => !!p && p.ativo !== false && (p.perfil === "admin" || p.setor === "Pós-Protocolo");
  const projectById = (id) => state.projects.find(p => p.id === id);
  const progressById = (id) => state.progresses.find(p => p.id === id);
  const weekRow = (municipioId, weekNo) => state.weeks.find(w => w.municipio_id === municipioId && w.semana === weekNo);
  const recordsFor = (weekId) => weekId ? state.records.filter(r => r.semana_id === weekId) : [];
  const filesFor = (weekId) => weekId ? state.files.filter(f => f.semana_id === weekId) : [];

  function ensureUi() {
    if (qs("weeklyMunicipalitiesNav")) return;
    const anchor = document.querySelector('[data-view="andamentos"]');
    if (!anchor) return;
    const nav = document.createElement("button");
    nav.id = "weeklyMunicipalitiesNav"; nav.className = "nav-button"; nav.dataset.view = "gestao-semanal";
    nav.innerHTML = "<span>Gestão Semanal</span>";
    anchor.insertAdjacentElement("afterend", nav);

    const main = document.querySelector("main.main-content");
    const section = document.createElement("section");
    section.id = "gestao-semanal"; section.className = "view weekly-view";
    section.innerHTML = `
      <div class="section-head weekly-head"><div><p class="eyebrow">Pós-Protocolo</p><h2>Gestão semanal de municípios</h2><p class="muted">O mês é dividido em 4 semanas. O município é inserido em uma semana específica e se repete na mesma semana nos meses seguintes.</p></div></div>
      <div class="weekly-toolbar">
        <label>Ano<select id="weeklyYear"></select></label><label>Mês<select id="weeklyMonth"></select></label>
        <label class="weekly-search-label">Buscar<input id="weeklySearch" type="search" placeholder="Município, projeto ou núcleo"></label>
        <button id="weeklyRefresh" class="secondary" type="button">Atualizar</button>
      </div>
      <div id="weeklySummary" class="weekly-summary"></div>
      <div id="weeklyBoard" class="weekly-board"></div>`;
    main.appendChild(section);

    document.body.insertAdjacentHTML("beforeend", `
      <dialog id="weeklyMunicipalityDialog" class="dialog"><form id="weeklyMunicipalityForm" method="dialog"><div class="dialog-body">
        <div class="dialog-head"><div><p class="eyebrow">Gestão semanal</p><h2 id="weeklyMunicipalityTitle">Adicionar município</h2></div><button type="button" class="icon-button" data-weekly-close="weeklyMunicipalityDialog">×</button></div>
        <input id="weeklyMunicipalityId" type="hidden">
        <div class="form-grid">
          <label>Semana<select id="weeklyMunicipalityWeek" required><option value="1">Semana 1</option><option value="2">Semana 2</option><option value="3">Semana 3</option><option value="4">Semana 4</option></select></label>
          <label>UF<input id="weeklyMunicipalityState" maxlength="2" required placeholder="SC"></label>
          <label class="full">Projeto / Núcleo vinculado<select id="weeklyProject"><option value="">Sem vínculo</option></select></label>
          <label class="full">Andamento vinculado<select id="weeklyProgress"><option value="">Sem andamento específico</option></select></label>
          <label class="full">Município<input id="weeklyMunicipalityName" required></label>
          <label>Telefone<input id="weeklyMunicipalityPhone"></label>
          <label class="full">Observações<textarea id="weeklyMunicipalityNotes" rows="3"></textarea></label>
        </div>
        <div class="dialog-actions"><button type="button" class="secondary" data-weekly-close="weeklyMunicipalityDialog">Cancelar</button><button class="primary" type="submit">Salvar</button></div>
      </div></form></dialog>

      <dialog id="weeklyWeekDialog" class="dialog large-dialog"><div class="dialog-body">
        <div class="dialog-head"><div><p class="eyebrow" id="weeklyWeekEyebrow">Gestão semanal</p><h2 id="weeklyWeekTitle">Município</h2><p id="weeklyWeekSubtitle" class="muted"></p></div><button type="button" class="icon-button" data-weekly-close="weeklyWeekDialog">×</button></div>
        <div id="weeklyWeekStatus" class="weekly-week-status"></div>
        <div class="weekly-detail-actions"><button id="weeklyEditFromDetail" class="secondary small-button" type="button">Editar card</button><button id="weeklyToggleDone" class="secondary small-button" type="button">Concluir semana</button></div>
        <form id="weeklyRecordForm" class="weekly-record-form"><label class="full">Novo registro / andamento<textarea id="weeklyRecordComment" rows="3" required placeholder="Registre contato, retorno, pendência ou providência desta semana."></textarea></label><div class="dialog-actions"><button class="primary" type="submit">Adicionar registro</button></div></form>
        <form id="weeklyFileForm" class="weekly-file-form"><label class="full">Adicionar arquivo<input id="weeklyFileInput" type="file" required></label><div class="dialog-actions"><button class="secondary" type="submit">Enviar arquivo</button></div></form>
        <div class="weekly-detail-columns"><div><h3>Histórico desta semana</h3><div id="weeklyRecordsList" class="weekly-records-list"></div></div><div><h3>Arquivos desta semana</h3><div id="weeklyFilesList" class="weekly-files-list"></div></div></div>
      </div></dialog>`);

    const current = new Date().getFullYear();
    qs("weeklyYear").innerHTML = Array.from({length:7},(_,i)=>current-3+i).map(y=>`<option value="${y}" ${y===state.year?"selected":""}>${y}</option>`).join("");
    qs("weeklyMonth").innerHTML = MONTHS.map((m,i)=>`<option value="${i+1}" ${i+1===state.month?"selected":""}>${m}</option>`).join("");

    nav.addEventListener("click", openView);
    qs("weeklyRefresh").addEventListener("click", loadData);
    qs("weeklySearch").addEventListener("input", renderBoard);
    qs("weeklyYear").addEventListener("change", async e => { state.year=Number(e.target.value); await loadData(); });
    qs("weeklyMonth").addEventListener("change", async e => { state.month=Number(e.target.value); await loadData(); });
    qs("weeklyProject").addEventListener("change", () => { syncProjectLocation(); fillProgressOptions(); });
    qs("weeklyMunicipalityForm").addEventListener("submit", saveMunicipality);
    qs("weeklyRecordForm").addEventListener("submit", saveRecord);
    qs("weeklyFileForm").addEventListener("submit", uploadFile);
    qs("weeklyToggleDone").addEventListener("click", toggleDone);
    qs("weeklyEditFromDetail").addEventListener("click", () => { const id=state.activeMunicipality?.id; qs("weeklyWeekDialog").close(); if(id) openMunicipalityDialog(id); });
    document.addEventListener("click", handleClick);

    const observer = new MutationObserver(() => annotateProjectCards());
    const projectsGrid = qs("projectsGrid"); if (projectsGrid) observer.observe(projectsGrid,{childList:true,subtree:true});
  }

  function openView() {
    document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === "gestao-semanal"));
    document.querySelectorAll(".nav-button").forEach(el => el.classList.toggle("active", el.id === "weeklyMunicipalitiesNav"));
    if (qs("pageEyebrow")) qs("pageEyebrow").textContent="Pós-Protocolo";
    if (qs("pageTitle")) qs("pageTitle").textContent="Gestão Semanal";
    if (qs("pageDescription")) qs("pageDescription").textContent="Municípios organizados por semana recorrente.";
    loadData();
  }

  async function loadData() {
    if (!state.user) return;
    const [m,p,a,w] = await Promise.all([
      db.from("pos_protocolo_municipios").select("*").eq("ativo",true).order("semana_padrao").order("nome"),
      db.from("projetos").select("id,nome,cidade,estado,ativo").order("cidade").order("nome"),
      db.from("andamentos").select("id,projeto_id,status,descricao_cliente,data_atualizacao,created_at").order("data_atualizacao",{ascending:false}),
      db.from("pos_protocolo_semanas").select("*").eq("ano",state.year).eq("mes",state.month)
    ]);
    const err=m.error||p.error||a.error||w.error; if(err) return toast(err.message,"error");
    state.municipalities=m.data||[]; state.projects=p.data||[]; state.progresses=a.data||[]; state.weeks=w.data||[];
    const weekIds=state.weeks.map(x=>x.id);
    state.records=[]; state.files=[];
    if(weekIds.length){
      const [r,f]=await Promise.all([
        db.from("pos_protocolo_registros").select("*").in("semana_id",weekIds).order("created_at",{ascending:false}),
        db.from("pos_protocolo_arquivos").select("*").in("semana_id",weekIds).order("created_at",{ascending:false})
      ]);
      if(r.error||f.error) return toast((r.error||f.error).message,"error");
      state.records=r.data||[]; state.files=f.data||[];
    }
    fillProjectOptions(); renderBoard(); annotateProjectCards();
  }

  function fillProjectOptions(){
    const s=qs("weeklyProject"); if(!s)return; const v=s.value;
    s.innerHTML=`<option value="">Sem vínculo</option>${state.projects.map(p=>`<option value="${p.id}">${esc(p.cidade)}/${esc(p.estado)} — ${esc(p.nome)}</option>`).join("")}`; s.value=v;
  }
  function fillProgressOptions(){
    const s=qs("weeklyProgress"); if(!s)return; const v=s.value; const projectId=qs("weeklyProject")?.value;
    const rows=projectId?state.progresses.filter(a=>a.projeto_id===projectId):[];
    s.innerHTML=`<option value="">Sem andamento específico</option>${rows.map(a=>`<option value="${a.id}">${esc(a.status)} — ${esc(a.descricao_cliente||"").slice(0,80)}</option>`).join("")}`; s.value=rows.some(a=>a.id===v)?v:"";
  }
  function syncProjectLocation(){ const p=projectById(qs("weeklyProject")?.value); if(!p)return; qs("weeklyMunicipalityName").value=p.cidade||""; qs("weeklyMunicipalityState").value=p.estado||""; }

  function renderBoard(){
    const board=qs("weeklyBoard"); if(!board)return;
    const search=(qs("weeklySearch")?.value||"").trim().toLowerCase();
    const filtered=state.municipalities.filter(m=>{const p=projectById(m.projeto_id);return !search||[m.nome,m.estado,p?.nome,p?.cidade].join(" ").toLowerCase().includes(search)});
    const done=filtered.filter(m=>weekRow(m.id,m.semana_padrao)?.concluido).length;
    qs("weeklySummary").innerHTML=`<div><strong>${filtered.length}</strong><span>município(s) recorrente(s)</span></div><div><strong>${done}</strong><span>concluído(s) neste mês</span></div><div><strong>${filtered.length-done}</strong><span>pendente(s) neste mês</span></div>`;
    board.innerHTML=[1,2,3,4].map(weekNo=>{
      const rows=filtered.filter(m=>Number(m.semana_padrao)===weekNo);
      return `<section class="weekly-column"><div class="weekly-column-head"><div><p class="eyebrow">${MONTHS[state.month-1]} / ${state.year}</p><h3>Semana ${weekNo}</h3><span>${rows.length} município(s)</span></div><button class="primary small-button" type="button" data-weekly-add-week="${weekNo}">+ Município</button></div><div class="weekly-column-list">${rows.length?rows.map(m=>municipalityCard(m)).join(""):`<div class="weekly-empty">Nenhum município nesta semana.</div>`}</div></section>`;
    }).join("");
  }

  function municipalityCard(m){
    const p=projectById(m.projeto_id); const a=progressById(m.andamento_id); const w=weekRow(m.id,m.semana_padrao); const rc=recordsFor(w?.id).length; const fc=filesFor(w?.id).length;
    return `<article class="weekly-item ${w?.concluido?"done":"pending"}" data-weekly-card="${m.id}">
      <div class="weekly-item-head"><div><h4>${esc(m.nome)}/${esc(m.estado)}</h4><span class="weekly-status-dot">${w?.concluido?"Concluído":"Pendente"}</span></div><button class="secondary tiny-button" type="button" data-weekly-edit="${m.id}">Editar</button></div>
      ${p?`<p class="weekly-link">Núcleo: <strong>${esc(p.nome)}</strong></p>`:""}${a?`<p class="weekly-link">Andamento: <strong>${esc(a.status)}</strong></p>`:""}
      ${m.observacoes?`<p class="weekly-notes">${esc(m.observacoes)}</p>`:""}
      <button class="weekly-open-detail" type="button" data-weekly-open="${m.id}"><span>${rc} registro(s)</span><span>${fc} arquivo(s)</span><strong>Abrir semana</strong></button>
    </article>`;
  }

  function openMunicipalityDialog(id=null, forcedWeek=null){
    const m=state.municipalities.find(x=>x.id===id); qs("weeklyMunicipalityForm").reset();
    qs("weeklyMunicipalityId").value=m?.id||""; qs("weeklyMunicipalityTitle").textContent=m?"Editar município":"Adicionar município";
    fillProjectOptions(); qs("weeklyMunicipalityWeek").value=String(m?.semana_padrao||forcedWeek||1);
    if(m){ qs("weeklyProject").value=m.projeto_id||""; qs("weeklyMunicipalityName").value=m.nome||""; qs("weeklyMunicipalityState").value=m.estado||""; qs("weeklyMunicipalityPhone").value=m.telefone||""; qs("weeklyMunicipalityNotes").value=m.observacoes||""; }
    fillProgressOptions(); if(m?.andamento_id) qs("weeklyProgress").value=m.andamento_id;
    qs("weeklyMunicipalityDialog").showModal();
  }

  async function saveMunicipality(e){
    e.preventDefault(); const id=qs("weeklyMunicipalityId").value;
    const payload={semana_padrao:Number(qs("weeklyMunicipalityWeek").value), projeto_id:qs("weeklyProject").value||null, andamento_id:qs("weeklyProgress").value||null, nome:qs("weeklyMunicipalityName").value.trim(), estado:qs("weeklyMunicipalityState").value.trim().toUpperCase(), telefone:qs("weeklyMunicipalityPhone").value.trim()||null, observacoes:qs("weeklyMunicipalityNotes").value.trim()||null};
    const result=id?await db.from("pos_protocolo_municipios").update(payload).eq("id",id):await db.from("pos_protocolo_municipios").insert({...payload,created_by:state.user.id});
    if(result.error)return toast(result.error.message,"error"); qs("weeklyMunicipalityDialog").close(); await loadData(); toast("Município salvo na semana escolhida.");
  }

  async function getOrCreateWeek(m){
    let row=weekRow(m.id,m.semana_padrao); if(row)return row;
    const {data,error}=await db.from("pos_protocolo_semanas").insert({municipio_id:m.id,ano:state.year,mes:state.month,semana:m.semana_padrao,created_by:state.user.id}).select().single();
    if(error)throw error; state.weeks.push(data); return data;
  }

  async function openWeekDetail(id){
    const m=state.municipalities.find(x=>x.id===id); if(!m)return; state.activeMunicipality=m;
    try{state.activeWeek=await getOrCreateWeek(m);}catch(e){return toast(e.message,"error")}
    qs("weeklyWeekEyebrow").textContent=`${MONTHS[state.month-1]} / ${state.year} • Semana ${m.semana_padrao}`; qs("weeklyWeekTitle").textContent=`${m.nome}/${m.estado}`;
    const p=projectById(m.projeto_id); qs("weeklyWeekSubtitle").textContent=p?`Vinculado ao núcleo ${p.nome}`:"Sem Projeto/Núcleo vinculado"; renderDetail(); qs("weeklyWeekDialog").showModal();
  }

  function renderDetail(){
    const w=state.activeWeek; if(!w)return; qs("weeklyWeekStatus").innerHTML=`<span class="weekly-status-pill ${w.concluido?"done":"pending"}">${w.concluido?"Semana concluída":"Semana pendente"}</span>`;
    qs("weeklyToggleDone").textContent=w.concluido?"Reabrir semana":"Concluir semana";
    const rows=recordsFor(w.id); qs("weeklyRecordsList").innerHTML=rows.length?rows.map(r=>`<div class="weekly-record"><p>${esc(r.comentario)}</p><small>${new Date(r.created_at).toLocaleString("pt-BR")}</small></div>`).join(""):`<p class="muted">Nenhum registro nesta semana.</p>`;
    const fs=filesFor(w.id); qs("weeklyFilesList").innerHTML=fs.length?fs.map(f=>`<div class="weekly-file"><div><strong>${esc(f.nome_arquivo)}</strong><small>${f.tamanho?Math.ceil(f.tamanho/1024)+" KB":""}</small></div><div><button class="secondary tiny-button" type="button" data-weekly-download="${f.id}">Abrir</button><button class="secondary tiny-button" type="button" data-weekly-delete-file="${f.id}">Excluir</button></div></div>`).join(""):`<p class="muted">Nenhum arquivo nesta semana.</p>`;
  }

  async function saveRecord(e){e.preventDefault(); if(!state.activeWeek)return; const c=qs("weeklyRecordComment").value.trim(); if(!c)return; const {data,error}=await db.from("pos_protocolo_registros").insert({semana_id:state.activeWeek.id,municipio_id:state.activeMunicipality.id,comentario:c,created_by:state.user.id}).select().single(); if(error)return toast(error.message,"error"); state.records.unshift(data); qs("weeklyRecordComment").value=""; renderDetail(); renderBoard(); toast("Registro adicionado.");}
  async function toggleDone(){if(!state.activeWeek)return; const next=!state.activeWeek.concluido; const payload={concluido:next,concluido_em:next?new Date().toISOString():null,concluido_por:next?state.user.id:null}; const {error}=await db.from("pos_protocolo_semanas").update(payload).eq("id",state.activeWeek.id); if(error)return toast(error.message,"error"); Object.assign(state.activeWeek,payload); renderDetail(); renderBoard();}

  async function uploadFile(e){
    e.preventDefault(); if(!state.activeWeek||!state.activeMunicipality)return; const file=qs("weeklyFileInput").files?.[0]; if(!file)return;
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"); const path=`${state.activeMunicipality.id}/${state.year}-${String(state.month).padStart(2,"0")}-s${state.activeMunicipality.semana_padrao}/${crypto.randomUUID()}-${safe}`;
    const up=await db.storage.from("gestao-semanal").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false}); if(up.error)return toast(up.error.message,"error");
    const ins=await db.from("pos_protocolo_arquivos").insert({semana_id:state.activeWeek.id,municipio_id:state.activeMunicipality.id,nome_arquivo:file.name,storage_path:path,mime_type:file.type||null,tamanho:file.size,created_by:state.user.id}).select().single();
    if(ins.error){await db.storage.from("gestao-semanal").remove([path]);return toast(ins.error.message,"error")}
    state.files.unshift(ins.data); qs("weeklyFileForm").reset(); renderDetail(); renderBoard(); toast("Arquivo enviado.");
  }
  async function downloadFile(id){const f=state.files.find(x=>x.id===id); if(!f)return; const {data,error}=await db.storage.from("gestao-semanal").createSignedUrl(f.storage_path,300); if(error)return toast(error.message,"error"); window.open(data.signedUrl,"_blank","noopener");}
  async function deleteFile(id){const f=state.files.find(x=>x.id===id); if(!f||!confirm(`Excluir ${f.nome_arquivo}?`))return; const rem=await db.storage.from("gestao-semanal").remove([f.storage_path]); if(rem.error)return toast(rem.error.message,"error"); const del=await db.from("pos_protocolo_arquivos").delete().eq("id",id); if(del.error)return toast(del.error.message,"error"); state.files=state.files.filter(x=>x.id!==id); renderDetail(); renderBoard();}

  function annotateProjectCards(){
    const grid=qs("projectsGrid"); if(!grid||!state.municipalities.length)return;
    grid.querySelectorAll(".weekly-project-indicator").forEach(el=>el.remove());
    const projectIds=[...new Set(state.municipalities.map(m=>m.projeto_id).filter(Boolean))];
    projectIds.forEach(projectId=>{
      const rows=state.municipalities.filter(m=>m.projeto_id===projectId); const source=grid.querySelector(`[data-select-project="${projectId}"]`)||grid.querySelector(`[data-open-project-progress="${projectId}"]`)||grid.querySelector(`[data-edit-project="${projectId}"]`); if(!source)return;
      const card=source.closest(".project-card")||source.closest(".project-detail-panel"); if(!card)return;
      const info=document.createElement("div"); info.className="weekly-project-indicator"; info.innerHTML=`<strong>Gestão semanal</strong><span>${rows.map(m=>`${esc(m.nome)} • Semana ${m.semana_padrao}`).join(" · ")}</span>`;
      const actions=card.querySelector(".project-card-actions"); actions?actions.before(info):card.appendChild(info);
    });
  }

  function handleClick(e){
    const add=e.target.closest("[data-weekly-add-week]"); if(add)return openMunicipalityDialog(null,Number(add.dataset.weeklyAddWeek));
    const edit=e.target.closest("[data-weekly-edit]"); if(edit){e.stopPropagation();return openMunicipalityDialog(edit.dataset.weeklyEdit)}
    const open=e.target.closest("[data-weekly-open]"); if(open)return openWeekDetail(open.dataset.weeklyOpen);
    const close=e.target.closest("[data-weekly-close]"); if(close)return qs(close.dataset.weeklyClose)?.close();
    const down=e.target.closest("[data-weekly-download]"); if(down)return downloadFile(down.dataset.weeklyDownload);
    const del=e.target.closest("[data-weekly-delete-file]"); if(del)return deleteFile(del.dataset.weeklyDeleteFile);
  }

  async function activate(user){
    state.user=user; if(!user){qs("weeklyMunicipalitiesNav")?.remove();qs("gestao-semanal")?.remove();return;}
    const {data}=await db.from("profiles").select("*").eq("id",user.id).maybeSingle(); state.profile=data||null; if(!canUse(state.profile))return;
    ensureUi(); await loadData();
  }

  db.auth.getSession().then(({data})=>activate(data.session?.user||null));
  db.auth.onAuthStateChange((_event,session)=>setTimeout(()=>activate(session?.user||null),0));
}
