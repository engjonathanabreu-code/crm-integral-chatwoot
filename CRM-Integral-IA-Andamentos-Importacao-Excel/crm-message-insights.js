import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

(() => {
  'use strict';
  if (window.__CRM_MESSAGE_INSIGHTS__) return;
  window.__CRM_MESSAGE_INSIGHTS__ = true;

  const cfg = window.CRM_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const state = { clientes: [], projetos: [], interacoes: [], loaded: false, loading: false };
  const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const norm = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const num = v => Number(v || 0).toLocaleString('pt-BR');
  const within = (v, days) => { if (!days) return true; const d=new Date(v); return !Number.isNaN(d.getTime()) && Date.now()-d.getTime() <= days*86400000; };

  const STOP = new Set(`a o as os um uma uns umas de da do das dos e em no na nos nas por para com sem que quem qual quais como quando onde porque pois se ao aos à às é são foi foram ser ter tem tenho temos seu sua seus suas meu minha meus minhas nosso nossa nossos nossas este esta esse essa isso isto aquele aquela já ainda muito muita muitos muitas mais menos também então aqui ali lá agora hoje ontem amanhã bom boa dia tarde noite oi olá obrigado obrigada favor gostaria queria quero preciso pode poderia podem poderia saber ver dar fazer feito fica ficou ficando vou vai vamos estou está estão estava estavam pra pro pelo pela pelos pelas sobre entre até ou mas sim não certo ok beleza tudo nada coisa coisas mensagem mensagens cliente clientes contato contatos atendimento atendimentos pessoal gente`.split(/\s+/));
  const SERVICE = new Set(`reurb regularizacao regularização fundiaria fundiária escritura matricula matrícula registro cartorio cartório prefeitura protocolo processo andamento prazo documento documentos documental certidao certidão contrato assinatura lote terreno imovel imóvel proprietario proprietário posse planta memorial topografia topografico topográfico levantamento medicao medição georreferenciamento geo referenciamento projeto projetos engenharia infraestrutura drenagem pavimentacao pavimentação agua água energia rede licenca licença aprovacao aprovação correcao correção exigencia exigência diligencia diligência crf boleto pagamento parcela pix cobranca cobrança financeiro nota fiscal orçamento orcamento proposta comercial cadastro mapa ortofoto aerolevantamento confrontante confrontantes confrontacao confrontação retificacao retificação usucapiao usucapião desmembramento remembramento nucleo núcleo nui loteamento`.split(/\s+/).map(norm));

  function projectForClient(c){ return state.projetos.find(p=>String(p.id)===String(c.projeto_id)); }
  function cityOfClient(c){ return String(c?.municipio || projectForClient(c)?.cidade || 'Sem município').trim() || 'Sem município'; }
  function clientMap(){ return new Map(state.clientes.map(c=>[String(c.id),c])); }

  function excludedTokens(){
    const set=new Set(STOP);
    state.clientes.forEach(c=>String(c.nome||c.name||'').split(/[^\p{L}]+/u).map(norm).filter(Boolean).forEach(x=>set.add(x)));
    [...new Set([...state.clientes.map(cityOfClient),...state.projetos.map(p=>p.cidade).filter(Boolean)])].forEach(city=>String(city).split(/[^\p{L}]+/u).map(norm).filter(Boolean).forEach(x=>set.add(x)));
    return set;
  }

  function currentFilters(){
    return {
      days:Number(document.getElementById('baDays')?.value ?? 90),
      municipio:document.getElementById('baMunicipio')?.value || '',
      setor:document.getElementById('baSetor')?.value || '',
    };
  }

  function scopedMessages(){
    const filters=currentFilters(), cmap=clientMap();
    return state.interacoes.filter(m=>{
      if (String(m.autor_tipo||'') !== 'Cliente') return false;
      if (filters.days && !within(m.created_at,filters.days)) return false;
      if (filters.setor && String(m.setor||'') !== filters.setor) return false;
      if (filters.municipio) {
        const c=cmap.get(String(m.cliente_id));
        if (!c || cityOfClient(c)!==filters.municipio) return false;
      }
      return true;
    });
  }

  function wordRanking(messages){
    const excluded=excludedTokens(), counts=new Map();
    for (const m of messages){
      const text=norm(String(m.conteudo||'').replace(/https?:\/\/\S+/g,' '));
      const tokens=text.match(/[a-zà-ÿ]{3,}/gi)||[];
      for (const raw of tokens){
        const w=norm(raw);
        if (w.length<4 || excluded.has(w)) continue;
        if (!SERVICE.has(w)) continue;
        counts.set(w,(counts.get(w)||0)+1);
      }
    }
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR')).slice(0,18);
  }

  function cityRanking(messages){
    const cmap=clientMap(), counts=new Map(), contacts=new Map();
    for (const m of messages){
      const c=cmap.get(String(m.cliente_id));
      const city=c?cityOfClient(c):'Sem município';
      counts.set(city,(counts.get(city)||0)+1);
      if (!contacts.has(city)) contacts.set(city,new Set());
      if (m.cliente_id) contacts.get(city).add(String(m.cliente_id));
    }
    return [...counts.entries()].map(([city,total])=>({city,total,contacts:contacts.get(city)?.size||0})).sort((a,b)=>b.total-a.total).slice(0,10);
  }

  function render(){
    const root=document.getElementById('crmAnalyticsDashboard');
    if (!root || !state.loaded) return;
    root.querySelector('#crmMessageInsights')?.remove();

    const messages=scopedMessages();
    const words=wordRanking(messages);
    const cities=cityRanking(messages);
    const maxWord=Math.max(1,...words.map(x=>x[1]));
    const maxCity=Math.max(1,...cities.map(x=>x.total));

    const section=document.createElement('div');
    section.id='crmMessageInsights';
    section.className='ba-grid crm-message-insights-grid';
    section.innerHTML=`
      <section class="ba-panel crm-word-panel">
        <div class="ba-panel-head"><div><span>LINGUAGEM DOS CLIENTES</span><h3>Palavras mais associadas aos serviços</h3></div><small>${num(messages.length)} mensagens de clientes no recorte</small></div>
        <div class="crm-word-cloud">${words.length?words.map(([w,c],i)=>`<span class="crm-word-chip" style="--weight:${(c/maxWord).toFixed(3)}"><b>${esc(w)}</b><em>${num(c)}</em></span>`).join(''):'<p class="ba-empty">Ainda não há termos de serviço suficientes neste recorte.</p>'}</div>
        <p class="crm-analytics-note">Artigos, palavras de conversa, nomes de pessoas e nomes de cidades são removidos. O número ao lado indica quantas vezes o termo apareceu nas mensagens dos clientes.</p>
      </section>
      <section class="ba-panel crm-city-origin-panel">
        <div class="ba-panel-head"><div><span>ORIGEM DOS CONTATOS</span><h3>Cidades com mais mensagens recebidas</h3></div><small>Baseado nas mensagens dos clientes</small></div>
        <div class="crm-city-ranking">${cities.length?cities.map((x,i)=>`<div class="crm-city-row"><span class="crm-city-position">${i+1}</span><div><b>${esc(x.city)}</b><small>${num(x.contacts)} cliente${x.contacts===1?'':'s'}</small><i><u style="width:${Math.max(5,x.total/maxCity*100)}%"></u></i></div><strong>${num(x.total)}<small> mensagens</small></strong></div>`).join(''):'<p class="ba-empty">Sem mensagens de clientes no período selecionado.</p>'}</div>
      </section>`;

    const risk=root.querySelector('.ba-risk-panel');
    risk?.before(section) || root.appendChild(section);
  }

  async function load(){
    if(state.loading)return;state.loading=true;
    try{
      const {data:sess}=await sb.auth.getSession(); if(!sess?.session)return;
      const [clientes,projetos,interacoes]=await Promise.all([
        sb.from('clientes').select('id,nome,municipio,projeto_id'),
        sb.from('projetos').select('id,cidade'),
        sb.from('interacoes').select('cliente_id,setor,conteudo,autor_tipo,created_at')
      ]);
      if(clientes.error)throw clientes.error;if(projetos.error)throw projetos.error;if(interacoes.error)throw interacoes.error;
      state.clientes=clientes.data||[];state.projetos=projetos.data||[];state.interacoes=interacoes.data||[];state.loaded=true;render();
    }catch(e){console.warn('CRM Message Insights',e)}finally{state.loading=false}
  }

  function bindFilters(){
    ['baDays','baMunicipio','baSetor'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.dataset.messageInsightsBound){el.dataset.messageInsightsBound='1';el.addEventListener('change',()=>setTimeout(render,0));}});
    const refresh=document.getElementById('baRefresh');if(refresh&&!refresh.dataset.messageInsightsBound){refresh.dataset.messageInsightsBound='1';refresh.addEventListener('click',()=>{state.loaded=false;load();});}
  }

  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(document.getElementById('crmAnalyticsDashboard')){bindFilters();if(state.loaded)render();else load();}})}).observe(document.documentElement,{childList:true,subtree:true});
  if(document.getElementById('crmAnalyticsDashboard')){bindFilters();load();}
})();