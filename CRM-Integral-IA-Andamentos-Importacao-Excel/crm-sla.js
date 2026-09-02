import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const cfg=window.CRM_CONFIG||{};if(!cfg.supabaseUrl||!cfg.supabaseAnonKey){}else{
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let busy=false,last=0;
async function allRows(table,select,filters){let out=[];for(let from=0;;from+=1000){let q=sb.from(table).select(select).order('created_at',{ascending:true}).range(from,from+999);for(const f of filters||[])q=q.gte(f[0],f[1]);const {data,error}=await q;if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break;}return out;}
function minutes(ms){return Math.max(0,Math.round(ms/60000));}
function fmtMin(m){if(m==null)return '—';if(m<60)return `${m} min`;const h=Math.floor(m/60),r=m%60;return `${h}h${r?` ${r}min`:''}`;}
function median(a){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2);}
function calculate(interactions,configs){
 const byConv=new Map();for(const x of interactions){const k=x.chatwoot_conversation_id;if(!k)continue;if(!byConv.has(k))byConv.set(k,[]);byConv.get(k).push(x)}
 const responses=[];for(const list of byConv.values()){list.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));let pending=null;for(const x of list){if(x.direcao==='entrada'&&String(x.autor_tipo).toLowerCase()==='cliente'){if(!pending)pending=x;continue;}if(pending&&x.direcao==='saida'&&String(x.autor_tipo).toLowerCase()==='agente'){responses.push({setor:x.setor||pending.setor||'Não definido',mins:minutes(new Date(x.created_at)-new Date(pending.created_at)),at:x.created_at});pending=null;}}}
 const sectors=[...new Set([...configs.keys(),...responses.map(x=>x.setor)])].filter(x=>x&&x!=='Não definido').sort((a,b)=>a.localeCompare(b,'pt-BR'));
 return sectors.map(setor=>{const arr=responses.filter(x=>x.setor===setor),limit=configs.get(setor)?.primeira_resposta_minutos||120,ok=arr.filter(x=>x.mins<=limit).length;return {setor,total:arr.length,median:median(arr.map(x=>x.mins)),limit,pct:arr.length?Math.round(ok*100/arr.length):null};});
}
function render(rows){
 let panel=document.querySelector('#crmSlaPanel');const grid=document.querySelector('#dashboard .dashboard-grid');if(!grid)return;
 if(!panel){panel=document.createElement('article');panel.id='crmSlaPanel';panel.className='panel crm-sla-panel';grid.appendChild(panel);}
 const valid=rows.filter(x=>x.total);const total=valid.reduce((s,x)=>s+x.total,0),weighted=total?Math.round(valid.reduce((s,x)=>s+(x.pct||0)*x.total,0)/total):0;
 panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">SLA de atendimento</p><h2>Primeira resposta humana</h2><p class="muted">Últimos 30 dias · respostas da IA não encerram o relógio</p></div><strong class="panel-kpi ${weighted<80?'sla-danger':weighted<90?'sla-warn':''}">${total?weighted+'%':'—'}</strong></div><div class="crm-sla-list">${rows.map(r=>`<div class="crm-sla-row"><div><strong>${esc(r.setor)}</strong><small>${r.total} resposta${r.total===1?'':'s'} · meta até ${fmtMin(r.limit)}</small></div><div><b>${r.pct==null?'—':r.pct+'%'}</b><span>mediana ${fmtMin(r.median)}</span></div><i><em style="width:${Math.min(100,r.pct||0)}%"></em></i></div>`).join('')||'<p class="muted">Sem dados de resposta no período.</p>'}</div>`;
}
async function refresh(force=false){if(busy||(!force&&Date.now()-last<60000))return;const dash=document.querySelector('#dashboard.view.active');if(!dash)return;busy=true;try{const since=new Date(Date.now()-30*86400000).toISOString();const [{data:cfgs,error},ints]=await Promise.all([sb.from('sla_atendimento_config').select('*').eq('ativo',true),allRows('interacoes','chatwoot_conversation_id,direcao,autor_tipo,setor,created_at',[[0,since]])]);if(error)throw error;const map=new Map((cfgs||[]).map(x=>[x.setor,x]));render(calculate(ints,map));last=Date.now();}catch(e){console.warn('CRM SLA',e)}finally{busy=false;}}
new MutationObserver(()=>refresh()).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>refresh(true),1000));setInterval(()=>refresh(),60000);
}