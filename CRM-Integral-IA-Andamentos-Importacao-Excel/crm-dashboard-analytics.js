import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

(() => {
  'use strict';
  if (window.__CRM_INTEGRAL_BA__) return;
  window.__CRM_INTEGRAL_BA__ = true;

  const cfg = window.CRM_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const state = { days: 90, municipio: '', setor: '', data: null, loading: false };
  const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v) => Number(v || 0).toLocaleString('pt-BR');
  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const norm = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const parseDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
  const daysAgo = (v) => { const d = parseDate(v); return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null; };
  const within = (v, days) => { if (!days) return true; const d = parseDate(v); return d ? (Date.now() - d.getTime()) <= days * 86400000 : false; };
  const sum = (arr, fn) => arr.reduce((a,x) => a + Number(fn(x) || 0), 0);

  function goto(view) {
    document.querySelector(`.nav-button[data-view="${view}"]`)?.click();
  }

  async function safe(table) {
    try {
      const r = await sb.from(table).select('*');
      if (r.error) { console.warn('CRM Analytics', table, r.error.message); return []; }
      return r.data || [];
    } catch (e) { console.warn('CRM Analytics', table, e); return []; }
  }

  async function load() {
    const { data: sess } = await sb.auth.getSession();
    if (!sess?.session) return null;
    const [clientes, atendimentos, tarefas, projetos, andamentos, profiles] = await Promise.all([
      safe('clientes'), safe('atendimentos'), safe('tarefas'), safe('projetos'), safe('andamentos'), safe('profiles')
    ]);
    return { clientes, atendimentos, tarefas, projetos, andamentos, profiles };
  }

  function projectForClient(c, projects) { return projects.find(p => String(p.id) === String(c.projeto_id)); }
  function municipioOfClient(c, projects) { return c.municipio || projectForClient(c, projects)?.cidade || 'Sem município'; }
  function sectorOfTicket(t) { return t.setor || t.sector || 'Não informado'; }
  function ticketStatus(t) { return t.status || 'Aberto'; }
  function taskDone(t) { return !!(t.concluida || t.concluido || /conclu|feito/i.test(String(t.status || ''))); }
  function clientValue(c) { return Number(c.valor_estimado || c.valor || c.valor_contrato || 0); }
  function isActiveProject(p) { return p.ativo !== false && !/inativ|conclu|cancel/i.test(String(p.status || '')); }

  function filters(data) {
    const municipios = [...new Set(data.clientes.map(c => municipioOfClient(c, data.projetos)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const setores = [...new Set(data.atendimentos.map(sectorOfTicket).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    return { municipios, setores };
  }

  function scoped(data) {
    const clientIds = new Set();
    const clients = data.clientes.filter(c => {
      const city = municipioOfClient(c, data.projetos);
      const ok = !state.municipio || city === state.municipio;
      if (ok) clientIds.add(String(c.id));
      return ok;
    });
    const tickets = data.atendimentos.filter(t => (!state.setor || sectorOfTicket(t) === state.setor) && (!state.days || within(t.created_at || t.data_criacao || t.updated_at, state.days)) && (!state.municipio || clientIds.has(String(t.cliente_id))));
    const tasks = data.tarefas.filter(t => (!state.days || within(t.created_at || t.data_criacao || t.prazo || t.updated_at, state.days)) && (!state.municipio || clientIds.has(String(t.cliente_id))));
    const projectIds = new Set(clients.map(c => String(c.projeto_id || '')).filter(Boolean));
    const projects = data.projetos.filter(p => !state.municipio || p.cidade === state.municipio || projectIds.has(String(p.id)));
    const andamentos = data.andamentos.filter(a => projects.some(p => String(p.id) === String(a.projeto_id)) && (!state.days || within(a.data_atualizacao || a.created_at, state.days)));
    return { clients, tickets, tasks, projects, andamentos };
  }

  function monthlySeries(tickets, clients) {
    const months = [];
    const now = new Date();
    const count = state.days <= 30 ? 4 : state.days <= 90 ? 6 : 8;
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      months.push({ key, label: d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''), atend: 0, novos: 0 });
    }
    tickets.forEach(t => { const d=parseDate(t.created_at||t.data_criacao); if(!d)return; const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; const m=months.find(x=>x.key===k); if(m)m.atend++; });
    clients.forEach(c => { const d=parseDate(c.created_at); if(!d)return; const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; const m=months.find(x=>x.key===k); if(m)m.novos++; });
    return months;
  }

  function projectRisk(p, scopedData, allData) {
    const ps = scopedData.andamentos.filter(a => String(a.projeto_id) === String(p.id));
    const latest = [...allData.andamentos].filter(a => String(a.projeto_id)===String(p.id)).sort((a,b)=>String(b.data_atualizacao||b.created_at||'').localeCompare(String(a.data_atualizacao||a.created_at||'')))[0];
    const stale = daysAgo(latest?.data_atualizacao || latest?.created_at);
    const relatedClients = scopedData.clients.filter(c => String(c.projeto_id)===String(p.id));
    const relatedIds = new Set(relatedClients.map(c=>String(c.id)));
    const openTickets = scopedData.tickets.filter(t => relatedIds.has(String(t.cliente_id)) && !/resolvido/i.test(ticketStatus(t))).length;
    const pendingTasks = scopedData.tasks.filter(t => relatedIds.has(String(t.cliente_id)) && !taskDone(t)).length;
    let score = 0;
    if (stale == null) score += 25; else if (stale > 60) score += 35; else if (stale > 30) score += 25; else if (stale > 14) score += 12;
    score += Math.min(30, openTickets * 6);
    score += Math.min(25, pendingTasks * 5);
    if (/paralis|atras|correç|pend/i.test(String(p.status || ''))) score += 15;
    return { score: Math.min(100, score), stale, openTickets, pendingTasks, latest: latest || ps[0] };
  }

  function insightList(s, data) {
    const out=[];
    const open=s.tickets.filter(t=>!/resolvido/i.test(ticketStatus(t))).length;
    const total=s.tickets.length;
    const negotiation=s.clients.filter(c=>/negocia|proposta|contato feito/i.test(String(c.status||'')));
    const pipeline=sum(negotiation,clientValue);
    const topCity=Object.entries(s.clients.reduce((a,c)=>{const k=municipioOfClient(c,data.projetos);a[k]=(a[k]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1])[0];
    if (total && open/total > .45) out.push({tone:'warn',title:'Pressão no atendimento',text:`${Math.round(open/total*100)}% dos atendimentos do período seguem em aberto.`});
    if (pipeline > 0) out.push({tone:'good',title:'Pipeline comercial',text:`Há ${money(pipeline)} em oportunidades com valor informado no recorte atual.`});
    if (topCity && s.clients.length && topCity[1]/s.clients.length > .35) out.push({tone:'neutral',title:'Concentração geográfica',text:`${topCity[0]} concentra ${Math.round(topCity[1]/s.clients.length*100)}% dos clientes filtrados.`});
    const late=s.tasks.filter(t=>!taskDone(t) && t.prazo && new Date(t.prazo)<new Date()).length;
    if (late) out.push({tone:'bad',title:'Ações vencidas',text:`${late} tarefa(s) estão com prazo vencido e ainda não foram concluídas.`});
    if (!out.length) out.push({tone:'good',title:'Operação equilibrada',text:'Nenhum desvio relevante foi identificado com os filtros atuais.'});
    return out.slice(0,4);
  }

  function render() {
    if (!state.data) return;
    const dashboard=document.getElementById('dashboard');
    if(!dashboard)return;
    let root=document.getElementById('crmAnalyticsDashboard');
    if(!root){root=document.createElement('div');root.id='crmAnalyticsDashboard';dashboard.prepend(root);dashboard.classList.add('ba-active');}
    const data=state.data, s=scoped(data), opts=filters(data);
    const openTickets=s.tickets.filter(t=>!/resolvido/i.test(ticketStatus(t))).length;
    const pendingTasks=s.tasks.filter(t=>!taskDone(t)).length;
    const activeProjects=s.projects.filter(isActiveProject).length;
    const activeClients=s.clients.filter(c=>!/perdido/i.test(String(c.status||''))).length;
    const negotiation=s.clients.filter(c=>/negocia|proposta|contato feito/i.test(String(c.status||'')));
    const pipeline=sum(negotiation,clientValue);
    const lost=s.clients.filter(c=>/perdido/i.test(String(c.status||''))).length;
    const won=s.clients.filter(c=>/cliente ativo/i.test(String(c.status||''))).length;
    const conversion=(won+lost)?Math.round(won/(won+lost)*100):0;
    const series=monthlySeries(s.tickets,s.clients), maxSeries=Math.max(1,...series.flatMap(x=>[x.atend,x.novos]));
    const sectorCounts=Object.entries(s.tickets.reduce((a,t)=>{const k=sectorOfTicket(t);a[k]=(a[k]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]);
    const statusCounts=Object.entries(s.clients.reduce((a,c)=>{const k=c.status||'Sem status';a[k]=(a[k]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]);
    const cityCounts=Object.entries(s.clients.reduce((a,c)=>{const k=municipioOfClient(c,data.projetos);a[k]=(a[k]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const risks=s.projects.filter(isActiveProject).map(p=>({p,...projectRisk(p,s,data)})).sort((a,b)=>b.score-a.score).slice(0,6);
    const insights=insightList(s,data);
    const maxSector=Math.max(1,...sectorCounts.map(x=>x[1])), maxStatus=Math.max(1,...statusCounts.map(x=>x[1]));

    root.innerHTML=`
      <div class="ba-hero">
        <div><span class="ba-kicker">BUSINESS ANALYTICS</span><h2>Central de desempenho do CRM</h2><p>Leitura integrada de clientes, comercial, atendimento, tarefas e projetos.</p></div>
        <button class="secondary" id="baRefresh">↻ Atualizar análise</button>
      </div>
      <div class="ba-filterbar">
        <label>Período<select id="baDays"><option value="30">30 dias</option><option value="90">90 dias</option><option value="180">6 meses</option><option value="0">Todo o histórico</option></select></label>
        <label>Município<select id="baMunicipio"><option value="">Todos</option>${opts.municipios.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label>
        <label>Setor<select id="baSetor"><option value="">Todos</option>${opts.setores.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label>
        <div class="ba-filter-note">Filtros recalculam todos os indicadores</div>
      </div>
      <div class="ba-kpis">
        <button class="ba-kpi" data-go="clientes"><span>Clientes no recorte</span><strong>${num(activeClients)}</strong><small>${num(s.clients.length)} registros totais</small></button>
        <button class="ba-kpi" data-go="funil"><span>Pipeline estimado</span><strong>${money(pipeline)}</strong><small>${negotiation.length} oportunidades</small></button>
        <button class="ba-kpi ${openTickets?'attention':''}" data-go="atendimentos"><span>Atendimentos abertos</span><strong>${num(openTickets)}</strong><small>de ${num(s.tickets.length)} no período</small></button>
        <button class="ba-kpi ${pendingTasks?'attention':''}" data-go="tarefas"><span>Tarefas pendentes</span><strong>${num(pendingTasks)}</strong><small>ações em aberto</small></button>
        <button class="ba-kpi" data-go="projetos"><span>Projetos ativos</span><strong>${num(activeProjects)}</strong><small>${num(s.projects.length)} no recorte</small></button>
        <button class="ba-kpi"><span>Conversão comercial</span><strong>${conversion}%</strong><small>ativos ÷ ativos + perdidos</small></button>
      </div>
      <div class="ba-grid ba-grid-main">
        <section class="ba-panel ba-span-2"><div class="ba-panel-head"><div><span>EVOLUÇÃO</span><h3>Atividade do CRM</h3></div><small>Atendimentos × novos clientes</small></div><div class="ba-chart">${series.map(m=>`<div class="ba-chart-col"><div class="ba-bars"><i style="height:${Math.max(4,m.atend/maxSeries*130)}px" title="${m.atend} atendimentos"></i><i class="secondary-bar" style="height:${Math.max(4,m.novos/maxSeries*130)}px" title="${m.novos} clientes"></i></div><b>${esc(m.label)}</b><small>${m.atend}/${m.novos}</small></div>`).join('')}</div><div class="ba-legend"><span><i></i> Atendimentos</span><span><i class="secondary-bar"></i> Novos clientes</span></div></section>
        <section class="ba-panel"><div class="ba-panel-head"><div><span>INSIGHTS</span><h3>Leitura gerencial</h3></div></div><div class="ba-insights">${insights.map(i=>`<article class="${i.tone}"><b>${esc(i.title)}</b><p>${esc(i.text)}</p></article>`).join('')}</div></section>
      </div>
      <div class="ba-grid ba-grid-3">
        <section class="ba-panel"><div class="ba-panel-head"><div><span>ATENDIMENTO</span><h3>Demanda por setor</h3></div></div><div class="ba-ranked">${sectorCounts.map(([k,v])=>`<div><span><b>${esc(k)}</b><em>${v}</em></span><i><u style="width:${v/maxSector*100}%"></u></i></div>`).join('')||'<p class="ba-empty">Sem atendimentos no período.</p>'}</div></section>
        <section class="ba-panel"><div class="ba-panel-head"><div><span>COMERCIAL</span><h3>Clientes por estágio</h3></div></div><div class="ba-ranked">${statusCounts.map(([k,v])=>`<div><span><b>${esc(k)}</b><em>${v}</em></span><i><u style="width:${v/maxStatus*100}%"></u></i></div>`).join('')||'<p class="ba-empty">Sem clientes no recorte.</p>'}</div></section>
        <section class="ba-panel"><div class="ba-panel-head"><div><span>CARTEIRA</span><h3>Concentração por município</h3></div></div><div class="ba-city-list">${cityCounts.map(([k,v],idx)=>`<button data-city="${esc(k)}"><span>${idx+1}</span><b>${esc(k)}</b><em>${v}</em></button>`).join('')||'<p class="ba-empty">Sem municípios no recorte.</p>'}</div></section>
      </div>
      <section class="ba-panel ba-risk-panel"><div class="ba-panel-head"><div><span>GESTÃO POR EXCEÇÃO</span><h3>Projetos que exigem atenção</h3></div><small>Score combina tempo sem andamento, atendimentos e tarefas abertas</small></div><div class="ba-risk-table"><div class="ba-risk-head"><span>Projeto</span><span>Último andamento</span><span>Atendimentos</span><span>Tarefas</span><span>Risco</span></div>${risks.map(r=>`<button data-go="projetos" class="ba-risk-row"><span><b>${esc(r.p.nome||r.p.name||'Projeto')}</b><small>${esc(r.p.cidade||'')}</small></span><span>${r.stale==null?'Sem registro':`${r.stale} dia(s)`}</span><span>${r.openTickets}</span><span>${r.pendingTasks}</span><span><i class="risk ${r.score>=60?'high':r.score>=30?'mid':'low'}">${r.score}</i></span></button>`).join('')||'<p class="ba-empty">Nenhum projeto ativo no recorte.</p>'}</div></section>`;

    const days=document.getElementById('baDays'), city=document.getElementById('baMunicipio'), sector=document.getElementById('baSetor');
    days.value=String(state.days); city.value=state.municipio; sector.value=state.setor;
    days.onchange=()=>{state.days=Number(days.value);render()};
    city.onchange=()=>{state.municipio=city.value;render()};
    sector.onchange=()=>{state.setor=sector.value;render()};
    document.getElementById('baRefresh').onclick=refresh;
    root.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>goto(b.dataset.go));
    root.querySelectorAll('[data-city]').forEach(b=>b.onclick=()=>{state.municipio=b.dataset.city;render()});
  }

  async function refresh() {
    if (state.loading) return;
    state.loading=true;
    const btn=document.getElementById('baRefresh'); if(btn){btn.disabled=true;btn.textContent='Atualizando...';}
    try { const data=await load(); if(data){state.data=data;render();} }
    finally { state.loading=false; const b=document.getElementById('baRefresh'); if(b){b.disabled=false;b.textContent='↻ Atualizar análise';} }
  }

  const syncObserver = new MutationObserver(() => {
    const sync=document.getElementById('syncStatus');
    if(sync?.textContent?.trim()==='Sincronizado' && !state.loading) refresh();
  });
  const boot=()=>{
    const sync=document.getElementById('syncStatus');
    if(sync)syncObserver.observe(sync,{childList:true,subtree:true,characterData:true});
    document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="dashboard"]'))setTimeout(refresh,60);if(e.target.closest?.('#refreshButton'))setTimeout(refresh,700)},true);
    const timer=setInterval(()=>{const shell=document.getElementById('appShell');if(shell&&!shell.classList.contains('hidden')){clearInterval(timer);refresh()}},500);
    setTimeout(()=>clearInterval(timer),20000);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
