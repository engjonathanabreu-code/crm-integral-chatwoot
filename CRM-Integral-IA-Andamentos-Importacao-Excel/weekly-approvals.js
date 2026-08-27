import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CONFIG = window.CRM_CONFIG || {};
if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) {
  const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const state = { user:null, profile:null, requests:[], profiles:[], projects:[], activeMunicipalityId:null };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const isAdmin = () => state.profile?.perfil === "admin";
  const canUse = () => state.profile?.ativo !== false && (isAdmin() || state.profile?.setor === "Pós-Protocolo");
  const pendingFor = id => state.requests.find(row=>row.municipio_id===id && row.status==="pendente");
  const profileName = id => state.profiles.find(row=>row.id===id)?.nome || state.profiles.find(row=>row.id===id)?.apelido || "Usuário";
  const projectName = id => state.projects.find(row=>row.id===id)?.nome || "";

  function toast(message,type="success"){const el=$("toast");if(!el)return;el.textContent=message;el.className=`toast ${type}`;setTimeout(()=>el.classList.add("hidden"),3500)}

  function ensureUi(){
    const section=$("gestao-semanal"),dialog=$("weeklyWeekDialog");if(!section||!dialog)return false;
    if(!$("weeklyDeletionApprovals")){const panel=document.createElement("div");panel.id="weeklyDeletionApprovals";panel.className="panel hidden";$("weeklyBoard")?.before(panel)}
    if(!$("weeklyRequestDelete")){const actions=dialog.querySelector(".weekly-detail-actions");if(actions){const button=document.createElement("button");button.id="weeklyRequestDelete";button.type="button";button.className="danger small-button";button.textContent="Solicitar exclusão";button.addEventListener("click",requestDeletion);actions.appendChild(button)}}
    updateDetailButton();renderAdminPanel();return true;
  }

  async function loadRequests(){
    if(!state.user||!canUse())return;
    const [requestsResult,profilesResult,projectsResult]=await Promise.all([
      db.from("pos_protocolo_exclusoes").select("*").eq("status","pendente").order("solicitado_em",{ascending:true}),
      db.from("profiles").select("id,nome,apelido"),db.from("projetos").select("id,nome")]);
    const error=requestsResult.error||profilesResult.error||projectsResult.error;if(error)return toast(`Não foi possível carregar as solicitações de exclusão: ${error.message}`,"error");
    state.requests=requestsResult.data||[];state.profiles=profilesResult.data||[];state.projects=projectsResult.data||[];ensureUi();
  }

  function updateDetailButton(){const button=$("weeklyRequestDelete");if(!button)return;const request=state.activeMunicipalityId?pendingFor(state.activeMunicipalityId):null;if(!state.activeMunicipalityId){button.classList.add("hidden");return}button.classList.remove("hidden");if(request){button.disabled=true;button.textContent=isAdmin()?"Exclusão aguardando aprovação":"Exclusão aguardando Admin";button.title="Já existe uma solicitação pendente para este município."}else{button.disabled=false;button.textContent="Solicitar exclusão";button.title="A exclusão só será efetivada depois da aprovação de um administrador."}}

  function renderAdminPanel(){const panel=$("weeklyDeletionApprovals");if(!panel)return;if(!isAdmin()){panel.classList.add("hidden");panel.innerHTML="";return}panel.classList.remove("hidden");panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">Aprovação administrativa</p><h3>Solicitações de exclusão</h3><p class="muted">O card só sai da Gestão Semanal depois da aprovação de um administrador.</p></div><strong>${state.requests.length}</strong></div><div class="record-list">${state.requests.length?state.requests.map(row=>`<article class="record-row"><div><h4>${esc(row.municipio_nome)}/${esc(row.estado)}</h4><p class="muted">Semana ${row.semana}${row.projeto_id?` • Núcleo: ${esc(projectName(row.projeto_id)||"Projeto vinculado")}`:" • Sem Projeto/Núcleo vinculado"}</p></div><div><strong>${esc(profileName(row.solicitado_por))}</strong><p class="muted">Solicitante</p></div><div><strong>${new Date(row.solicitado_em).toLocaleString("pt-BR")}</strong><p class="muted">Solicitado em</p></div><div class="record-actions"><button class="secondary small-button" type="button" data-weekly-reject-deletion="${row.id}">Recusar</button><button class="danger small-button" type="button" data-weekly-approve-deletion="${row.id}">Aprovar exclusão</button></div></article>`).join(""):`<p class="muted">Nenhuma solicitação de exclusão pendente.</p>`}</div>`}

  async function requestDeletion(){const municipalityId=state.activeMunicipalityId;if(!municipalityId)return;if(pendingFor(municipalityId))return toast("Já existe uma solicitação de exclusão pendente.","error");if(!window.confirm("Solicitar a exclusão deste card?\n\nO município continuará visível até que um administrador aprove a solicitação."))return;const{error}=await db.rpc("solicitar_exclusao_gestao_semanal",{p_municipio_id:municipalityId});if(error)return toast(error.message,"error");await loadRequests();toast("Solicitação enviada para aprovação de um administrador.")}
  async function approveDeletion(requestId){const request=state.requests.find(row=>row.id===requestId);if(!request)return;const linked=request.projeto_id?`\n\nSerá criado um registro no histórico do Projeto/Núcleo ${projectName(request.projeto_id)||"vinculado"}.`:"";if(!window.confirm(`Aprovar a exclusão de ${request.municipio_nome}/${request.estado} da Semana ${request.semana}?${linked}\n\nO histórico da Gestão Semanal será preservado para auditoria.`))return;const{error}=await db.rpc("aprovar_exclusao_gestao_semanal",{p_solicitacao_id:requestId});if(error)return toast(error.message,"error");if(state.activeMunicipalityId===request.municipio_id)$("weeklyWeekDialog")?.close();state.activeMunicipalityId=null;await loadRequests();$("weeklyRefresh")?.click();$("refreshButton")?.click();toast("Exclusão aprovada. O card foi removido da Gestão Semanal.")}
  async function rejectDeletion(requestId){const request=state.requests.find(row=>row.id===requestId);if(!request)return;const reason=window.prompt(`Motivo da recusa da exclusão de ${request.municipio_nome}/${request.estado} (opcional):`,"")??null;if(reason===null)return;const{error}=await db.rpc("recusar_exclusao_gestao_semanal",{p_solicitacao_id:requestId,p_motivo:reason});if(error)return toast(error.message,"error");await loadRequests();toast("Solicitação de exclusão recusada.")}

  document.addEventListener("click",event=>{const open=event.target.closest("[data-weekly-open]");if(open){state.activeMunicipalityId=open.dataset.weeklyOpen;setTimeout(()=>{ensureUi();updateDetailButton()},0)}const close=event.target.closest('[data-weekly-close="weeklyWeekDialog"]');if(close){state.activeMunicipalityId=null;updateDetailButton()}const approve=event.target.closest("[data-weekly-approve-deletion]");if(approve)approveDeletion(approve.dataset.weeklyApproveDeletion);const reject=event.target.closest("[data-weekly-reject-deletion]");if(reject)rejectDeletion(reject.dataset.weeklyRejectDeletion)});
  document.addEventListener("click",event=>{if(event.target.closest("#weeklyRefresh")||event.target.closest("#weeklyMunicipalitiesNav"))setTimeout(loadRequests,50)});

  // Importante: não observar document.body com MutationObserver aqui. renderAdminPanel()
  // altera o DOM e um observer global reexecutando ensureUi() criava um ciclo infinito,
  // bloqueando a thread principal e todos os cliques do CRM.
  db.auth.getSession().then(async({data})=>{state.user=data.session?.user||null;if(!state.user)return;const{data:profile}=await db.from("profiles").select("id,nome,apelido,perfil,setor,ativo").eq("id",state.user.id).maybeSingle();state.profile=profile||null;if(!canUse())return;ensureUi();await loadRequests()});
}
