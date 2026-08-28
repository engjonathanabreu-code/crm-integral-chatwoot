import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CONFIG = window.CRM_CONFIG || {};
const CLIENT_STATUSES = ["Novo", "Contato feito", "Proposta enviada", "Negociação", "Cliente Ativo", "Perdido"];
const TICKET_SECTORS = ["Atendimento", "Comercial", "Financeiro", "Projetos", "Topografia", "Pós-Protocolo"];
const USER_SECTORS = ["Administrativo", "Atendimento", "Comercial", "Financeiro", "Projetos", "Topografia", "Marketing", "Pós-Protocolo"];
const TICKET_STATUSES = ["Aberto", "Em andamento", "Resolvido"];
const MARKETING_FASE_COLORS = { 1: "var(--fase1)", 2: "var(--fase2)", 3: "var(--fase3)", 4: "var(--fase4)", 5: "var(--fase5)" };
const PROGRESS_STATUSES = ["Topografia", "Projeto", "Protocolado", "Correções para Prefeitura", "Registro de Imóveis", "Concluído", "Outros"];
const LIST_PAGE_SIZE = 30;

const state = {
  user: null,
  profile: null,
  profiles: [],
  clients: [],
  tickets: [],
  tasks: [],
  history: [],
  userHistory: [],
  interactions: [],
  marketingEtapas: [],
  marketingProjects: [],
  marketingProgress: [],
  projects: [],
  projectProgress: [],
  projectSchemaReady: false,
  projectsDrill: { municipio: null, projetoId: null },
  progressDrill: { municipio: null, projetoId: null },
  editingProgressId: null,
  currentView: "dashboard",
  selectedClientId: null,
  selectedMarketingProjectId: null,
  ticketsVisible: LIST_PAGE_SIZE,
  tasksVisible: LIST_PAGE_SIZE,
  importRows: [],
  importHeaders: [],
  importTemplate: null,
};

let supabase = null;

const $ = (id) => document.getElementById(id);
const isConfigured = () =>
  CONFIG.supabaseUrl &&
  CONFIG.supabaseAnonKey &&
  !CONFIG.supabaseUrl.includes("COLE_AQUI") &&
  !CONFIG.supabaseAnonKey.includes("COLE_AQUI");
const isAdmin = () => state.profile?.perfil === "admin";
const isMarketingTeam = () => isAdmin() || state.profile?.perfil === "marketing";
const canManageProject = (project) => isAdmin() || project?.created_by === state.user?.id;
// Igual a canManageProject, mas trata "projeto novo" (ainda sem
// created_by) como gerenciável por quem está criando — usado para
// habilitar o campo de Comerciais responsáveis também na criação.
const canManageProjectComerciais = (project) => !project || canManageProject(project);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function showToast(message, type = "success") {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add("hidden"), 3500);
}

function setSync(status, message) {
  const element = $("syncStatus");
  element.className = `sync-status ${status || ""}`;
  element.textContent = message;
}

function statusBadge(status) {
  const cls = status === "Cliente Ativo" || status === "Resolvido" ? "closed" : status === "Perdido" ? "lost" : status === "Aberto" ? "open" : "";
  return `<span class="badge ${cls}">${escapeHtml(status || "-")}</span>`;
}

function profileName(id) {
  const profile = state.profiles.find((item) => item.id === id) || (id === state.user?.id ? state.profile : null);
  return profile?.nome || profile?.apelido || "Usuário";
}

function normalizeNickname(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidNickname(value) {
  return /^[a-z0-9._-]{3,30}$/.test(normalizeNickname(value));
}

function clientDisplayName(client) {
  if (!client) return "Cliente removido";
  const code = String(client.codigo_processo || "").trim();
  const name = client.nome ? titleCaseName(client.nome) : "Sem nome";
  return code ? `${code} — ${name}` : name;
}

function clientName(id) {
  return clientDisplayName(state.clients.find((client) => client.id === id));
}

// Cliente atrelado a um Comercial (comercial_id), atribuído pelo
// Admin ou por quem cadastrou o cliente. Usado para filtrar Funil
// comercial e Atendimentos: só mostram clientes que já têm um
// Comercial responsável — não basta ter trocado mensagem com
// qualquer atendente no WhatsApp.
// Comerciais responsáveis por um cliente: o comercial_id atribuído
// diretamente ao cliente, mais os comerciais atribuídos ao núcleo
// (projetos.comercial_ids) do projeto vinculado, se houver.
function clientComercialIds(clientOrId) {
  const client = typeof clientOrId === "string"
    ? state.clients.find((item) => item.id === clientOrId)
    : clientOrId;
  if (!client) return [];
  const ids = new Set();
  if (client.comercial_id) ids.add(client.comercial_id);
  const project = client.projeto_id ? projectById(client.projeto_id) : null;
  (project?.comercial_ids || []).forEach((id) => ids.add(id));
  return [...ids];
}

function clientHasComercial(clientOrId) {
  return clientComercialIds(clientOrId).length > 0;
}

function clientMunicipio(id) {
  return state.clients.find((client) => client.id === id)?.municipio || "Sem município informado";
}

function clientNucleo(id) {
  return state.clients.find((client) => client.id === id)?.nucleo || "Sem NUI informado";
}


function projectById(id) {
  return state.projects.find((project) => project.id === id);
}

function municipioKeyOf(projectLike) {
  return `${(projectLike.cidade || "").trim().toLowerCase()}|${(projectLike.estado || "").trim().toUpperCase()}`;
}

function groupProjectsByMunicipio(projects) {
  const map = new Map();
  projects.forEach((project) => {
    const key = municipioKeyOf(project);
    if (!map.has(key)) map.set(key, { key, cidade: project.cidade, estado: project.estado, projects: [] });
    map.get(key).projects.push(project);
  });
  return [...map.values()].sort((a, b) =>
    `${a.cidade}/${a.estado}`.localeCompare(`${b.cidade}/${b.estado}`, "pt-BR")
  );
}

function projectLabel(project) {
  if (!project) return "Projeto não informado";
  return `${project.nome} — ${project.cidade}/${project.estado}`;
}

function clientProject(clientOrId) {
  const client = typeof clientOrId === "string" ? state.clients.find((item) => item.id === clientOrId) : clientOrId;
  return projectById(client?.projeto_id);
}

// Garante o DDI "55" em números de telefone brasileiros (DDD + número,
// 10 ou 11 dígitos), pra bater com o formato que o WhatsApp já usa. Sem
// isso, o mesmo cliente cadastrado no CRM sem "+55" e escrevendo depois
// pelo WhatsApp virava DOIS registros diferentes (telefone_normalizado
// "4796151814" x "554796151814"), com histórico fragmentado.
function normalizeBrazilPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function isMissingRelationError(error) {
  return error && (error.code === "42P01" || error.code === "42703" || /does not exist|Could not find.*schema cache/i.test(error.message || ""));
}

// Traduz erros comuns do Postgres (violação de índice único) para uma
// mensagem em português que a pessoa realmente entende, em vez do texto
// cru do banco (ex.: "duplicate key value violates unique constraint
// \"clientes_telefone_normalizado_unique\"").
const FRIENDLY_UNIQUE_ERRORS = {
  clientes_telefone_normalizado_unique: "Já existe um cliente cadastrado com esse telefone.",
  clientes_chatwoot_contact_id_unique: "Este contato do WhatsApp já está vinculado a outro cliente.",
  clientes_codigo_processo_uidx: "Já existe um cliente cadastrado com esse código de processo.",
  profiles_apelido_uidx: "Este nome de usuário já está em uso.",
  projetos_nome_cidade_estado_uidx: "Já existe um projeto com esse nome, cidade e estado.",
};

// Chave "frouxa" pra comparar cidade: sem acento, minúsculo, sem sufixo de
// estado ("Itaiópolis/SC", "Itaiópolis - SC" -> "itaiopolis"). Usada pra
// não deixar a mesma cidade virar vários municípios diferentes no CRM.
function normalizeCityKey(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\/\-–—]\s*[a-z]{2}\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Reaproveita a grafia já usada em algum Projeto/NUI ou em outro cliente
// para a mesma cidade, em vez de gravar uma variante nova a cada cadastro.
function canonicalCityName(rawCity) {
  const clean = String(rawCity || "").trim();
  if (!clean) return clean;
  const key = normalizeCityKey(clean);
  if (!key) return clean;
  const fromProject = state.projects.find((p) => normalizeCityKey(p.cidade) === key);
  if (fromProject) return fromProject.cidade;
  const fromClient = state.clients.find((c) => normalizeCityKey(c.municipio) === key);
  if (fromClient) return fromClient.municipio;
  return clean;
}

// Padroniza nomes de clientes: primeira letra de cada palavra em
// maiúscula, o resto em minúsculo (estilo "Proper" do Excel). Usa
// \p{L} (qualquer letra Unicode) pra lidar bem com acentos, hífen,
// apóstrofo e múltiplos nomes separados por "; " (várias palavras,
// não só a primeira do texto inteiro).
function titleCaseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\p{L}+/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function friendlyErrorMessage(error) {
  if (!error) return "Erro desconhecido.";
  const message = error.message || String(error);
  if (error.code === "23505") {
    const key = Object.keys(FRIENDLY_UNIQUE_ERRORS).find((k) => message.includes(k));
    if (key) return FRIENDLY_UNIQUE_ERRORS[key];
  }
  return message;
}

async function loadOptionalProjectData() {
  const [projectsResult, progressResult] = await Promise.all([
    supabase.from("projetos").select("*").order("cidade").order("nome"),
    supabase.from("andamentos").select("*").order("data_atualizacao", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  if (isMissingRelationError(projectsResult.error) || isMissingRelationError(progressResult.error)) {
    state.projects = [];
    state.projectProgress = [];
    state.projectSchemaReady = false;
    return;
  }
  if (projectsResult.error) throw projectsResult.error;
  if (progressResult.error) throw progressResult.error;
  state.projects = projectsResult.data || [];
  state.projectProgress = progressResult.data || [];
  state.projectSchemaReady = true;
}

function showOnly(screenId) {
  ["setupScreen", "loginScreen", "appShell"].forEach((id) => $(id).classList.add("hidden"));
  $(screenId).classList.remove("hidden");
}

async function bootstrap() {
  bindEvents();
  fillStaticOptions();

  if (!isConfigured()) {
    showOnly("setupScreen");
    return;
  }

  supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) console.error(error);

  if (data?.session?.user) {
    await startAuthenticated(data.session.user);
  } else {
    showOnly("loginScreen");
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT" || !session?.user) {
      resetState();
      showOnly("loginScreen");
    }
  });
}

function resetState() {
  Object.assign(state, {
    user: null,
    profile: null,
    profiles: [],
    clients: [],
    tickets: [],
    tasks: [],
    history: [],
    userHistory: [],
    interactions: [],
    marketingEtapas: [],
    marketingProjects: [],
    marketingProgress: [],
    projects: [],
    projectProgress: [],
    projectSchemaReady: false,
    projectsDrill: { municipio: null, projetoId: null },
    progressDrill: { municipio: null, projetoId: null },
    selectedClientId: null,
    selectedMarketingProjectId: null,
  });
}

async function startAuthenticated(user) {
  state.user = user;
  setSync("loading", "Carregando...");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,nome,perfil,ativo,created_at")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    console.error(error);
    await supabase.auth.signOut();
    $("loginMessage").textContent = "Seu perfil não foi encontrado. Execute o SQL de instalação ou fale com o administrador.";
    return;
  }

  if (!profile.ativo) {
    await supabase.auth.signOut();
    $("loginMessage").textContent = "Este usuário está desativado.";
    return;
  }

  state.profile = profile;
  showOnly("appShell");
  applyRoleUI();
  await loadData();
  setView("dashboard");
}

function applyRoleUI() {
  $("sidebarUserName").textContent = state.profile.nome || state.user.email;
  $("sidebarUserRole").textContent = isAdmin() ? "Administrador — acesso total" : "Usuário — dados próprios";
  document.querySelectorAll(".admin-only").forEach((element) => element.classList.toggle("hidden", !isAdmin()));
  document.querySelectorAll(".marketing-only").forEach((element) => element.classList.toggle("hidden", !isMarketingTeam()));
}


async function fetchAllClientsPaged() {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { data: rows, error: null };
}

async function loadData() {
  setSync("loading", "Atualizando...");
  try {
    const marketingQueries = isMarketingTeam()
      ? [
          supabase.from("marketing_etapas").select("*").order("ordem"),
          supabase.from("marketing_projetos").select("*").order("municipio"),
          supabase.from("marketing_progresso").select("*"),
        ]
      : [Promise.resolve({ data: [] }), Promise.resolve({ data: [] }), Promise.resolve({ data: [] })];

    const [profilesResult, clientsResult, ticketsResult, tasksResult, historyResult, userHistoryResult, interactionsResult, etapasResult, projectsResult, progressResult] = await Promise.all([
      supabase.from("profiles").select("id,nome,apelido,email,setor,perfil,ativo,created_at").order("apelido", { ascending: true, nullsFirst: false }).order("nome"),
      fetchAllClientsPaged(),
      supabase.from("atendimentos").select("*").order("created_at", { ascending: false }),
      supabase.from("tarefas").select("*").order("data", { ascending: true }),
      supabase.from("historico").select("*").order("created_at", { ascending: false }),
      supabase.from("usuario_historico").select("*").order("created_at", { ascending: false }),
      supabase.from("interacoes").select("*").order("created_at", { ascending: false }),
      ...marketingQueries,
    ]);

    const failures = [profilesResult, clientsResult, ticketsResult, tasksResult, historyResult, userHistoryResult, interactionsResult, etapasResult, projectsResult, progressResult].filter((result) => result.error);
    if (failures.length) throw failures[0].error;

    state.profiles = profilesResult.data || [];
    state.clients = clientsResult.data || [];
    state.tickets = ticketsResult.data || [];
    state.tasks = tasksResult.data || [];
    state.history = historyResult.data || [];
    state.userHistory = userHistoryResult.data || [];
    state.interactions = interactionsResult.data || [];
    state.marketingEtapas = etapasResult.data || [];
    state.marketingProjects = projectsResult.data || [];
    state.marketingProgress = progressResult.data || [];

    await loadOptionalProjectData();

    renderAll();
    setSync("", "Sincronizado");
  } catch (error) {
    console.error(error);
    setSync("error", "Erro de sincronização");
    showToast(`Erro ao carregar dados: ${error.message}`, "error");
  }
}

function fillStaticOptions() {
  $("clientStatus").innerHTML = CLIENT_STATUSES.map((status) => `<option>${status}</option>`).join("");
  $("clientStatusFilter").innerHTML = `<option value="">Todos os status</option>${CLIENT_STATUSES.map((status) => `<option>${status}</option>`).join("")}`;
  $("ticketSector").innerHTML = TICKET_SECTORS.map((sector) => `<option>${sector}</option>`).join("");
  $("ticketStatus").innerHTML = TICKET_STATUSES.map((status) => `<option>${status}</option>`).join("");
  $("ticketStatusFilter").innerHTML = `<option value="">Todos os status</option>${TICKET_STATUSES.map((status) => `<option>${status}</option>`).join("")}`;
  $("ticketStandaloneSector").innerHTML = TICKET_SECTORS.map((sector) => `<option>${sector}</option>`).join("");
  $("ticketStandaloneStatus").innerHTML = TICKET_STATUSES.map((status) => `<option>${status}</option>`).join("");
  $("taskDueDate").value = today();
}

function renderAll() {
  renderOwnerOptions();
  renderDashboard();
  renderClients();
  renderPipeline();
  renderTickets();
  renderTasks();
  renderUsers();
  renderProjects();
  renderProjectProgress();
  renderMarketingProjects();
  if (state.selectedClientId && $("clientDetailDialog").open) renderClientDetail(state.selectedClientId);
  if (state.selectedMarketingProjectId && $("marketingJourneyDialog").open) renderMarketingJourney(state.selectedMarketingProjectId);
}

function renderOwnerOptions() {
  const activeProfiles = state.profiles.filter((profile) => profile.ativo);
  const options = activeProfiles.map((profile) => `<option value="${profile.id}">${escapeHtml(profile.nome)}${profile.perfil === "admin" ? " (Admin)" : ""}</option>`).join("");
  $("clientOwner").innerHTML = options;
  $("taskAssignee").innerHTML = options;
  $("taskStandaloneAssignee").innerHTML = options;

  const filterOptions = `<option value="">Todos os responsáveis</option>${options}`;
  $("clientOwnerFilter").innerHTML = filterOptions;
  $("pipelineOwnerFilter").innerHTML = filterOptions;

  // Comercial: só usuários com perfil "comercial" podem ser
  // atribuídos como o Comercial responsável por um cliente.
  const comercialProfiles = activeProfiles.filter((profile) => profile.perfil === "comercial");
  const comercialOptions = comercialProfiles.map((profile) => `<option value="${profile.id}">${escapeHtml(profile.nome)}</option>`).join("");
  if ($("clientComercial")) $("clientComercial").innerHTML = `<option value="">Sem comercial atribuído</option>${comercialOptions}`;
  if ($("pipelineComercialFilter")) $("pipelineComercialFilter").innerHTML = `<option value="">Todos os comerciais</option>${comercialOptions}`;
  if ($("projectComerciais")) $("projectComerciais").innerHTML = comercialOptions;

  if ($("clientAgentsAssigned")) $("clientAgentsAssigned").innerHTML = options;

  const projectOptions = state.projects
    .filter((project) => project.ativo)
    .sort((a, b) => `${a.estado}-${a.cidade}-${a.nome}`.localeCompare(`${b.estado}-${b.cidade}-${b.nome}`, "pt-BR"))
    .map((project) => `<option value="${project.id}">${escapeHtml(projectLabel(project))}</option>`).join("");
  if ($("clientProject")) $("clientProject").innerHTML = `<option value="">Sem NUI / vincular depois</option>${projectOptions}`;
  if ($("clientImportProject")) $("clientImportProject").innerHTML = `<option value="">Sem NUI — vincular depois</option>${projectOptions}`;
  if ($("progressProject")) $("progressProject").innerHTML = `<option value="">Selecione um projeto</option>${projectOptions}`;

  if ($("marketingProjectSelect")) $("marketingProjectSelect").innerHTML = `<option value="">Selecione um projeto</option>${projectOptions}`;
}

// Tempo de resposta do agente humano: para cada conversa do Chatwoot
// (chatwoot_conversation_id), mede quanto tempo o cliente ficou
// esperando entre uma mensagem dele ("Cliente") e a próxima resposta
// de um Agente humano (não conta resposta da IA, que não é o "agente
// atribuído" — só zera a espera quando quem responde é Agente).
// Só considera a primeira mensagem de cada leva de espera (mensagens
// seguidas do cliente não reiniciam o cronômetro) e ignora esperas
// acima de 24h, que normalmente são conversa retomada dias depois, e
// não resposta lenta de fato.
function computeAgentResponseTimes() {
  const MAX_GAP_MS = 24 * 60 * 60 * 1000;
  const byConversation = new Map();
  state.interactions.forEach((item) => {
    if (!item.chatwoot_conversation_id) return;
    if (item.autor_tipo !== "Cliente" && item.autor_tipo !== "Agente") return;
    const list = byConversation.get(item.chatwoot_conversation_id) || [];
    list.push(item);
    byConversation.set(item.chatwoot_conversation_id, list);
  });

  const samples = [];
  byConversation.forEach((list) => {
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let waitingSince = null;
    list.forEach((item) => {
      if (item.autor_tipo === "Cliente") {
        if (!waitingSince) waitingSince = item.created_at;
      } else if (item.autor_tipo === "Agente" && waitingSince) {
        const gapMs = new Date(item.created_at) - new Date(waitingSince);
        if (gapMs >= 0 && gapMs <= MAX_GAP_MS) {
          samples.push({ agent: item.autor_nome || "Sem nome", minutes: gapMs / 60000 });
        }
        waitingSince = null;
      }
    });
  });

  const byAgent = samples.reduce((acc, sample) => {
    (acc[sample.agent] ||= []).push(sample.minutes);
    return acc;
  }, {});

  const agentStats = Object.keys(byAgent)
    .map((agent) => {
      const minutesList = byAgent[agent];
      const avgMinutes = minutesList.reduce((sum, m) => sum + m, 0) / minutesList.length;
      return { agent, count: minutesList.length, avgMinutes };
    })
    .sort((a, b) => a.avgMinutes - b.avgMinutes);

  const overallAvgMinutes = samples.length
    ? samples.reduce((sum, s) => sum + s.minutes, 0) / samples.length
    : null;

  return { agentStats, overallAvgMinutes, sampleCount: samples.length };
}

function formatResponseMinutes(minutes) {
  if (minutes == null) return "—";
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins ? `${hours}h ${mins}min` : `${hours}h`;
}

function renderDashboard() {
  $("metricClients").textContent = state.clients.length;
  $("metricNegotiation").textContent = state.clients.filter((client) => client.status === "Negociação").length;
  $("metricOpenTickets").textContent = state.tickets.filter((ticket) => ticket.status !== "Resolvido").length;
  $("metricPendingTasks").textContent = state.tasks.filter((task) => !task.concluida).length;

  const responseStats = computeAgentResponseTimes();
  $("metricResponseTime").textContent = formatResponseMinutes(responseStats.overallAvgMinutes);
  $("metricResponseTimeNote").textContent = responseStats.sampleCount
    ? `agente humano • ${responseStats.sampleCount} resposta(s)`
    : "sem dados ainda";

  const activePipeline = state.clients.filter((client) => !["Cliente Ativo", "Perdido"].includes(client.status));
  const showMoney = isAdmin();
  $("pipelineValue").textContent = showMoney ? money(activePipeline.reduce((sum, client) => sum + Number(client.valor_estimado || 0), 0)) : "Restrito";
  $("pipelineValue").classList.toggle("kpi-restricted", !showMoney);
  $("pipelineValue").title = showMoney ? "" : "Valores do funil visíveis apenas para administradores.";

  $("dashboardPipeline").innerHTML = CLIENT_STATUSES.map((status) => {
    const list = state.clients.filter((client) => client.status === status);
    const total = list.reduce((sum, client) => sum + Number(client.valor_estimado || 0), 0);
    const valueHtml = showMoney ? `<strong>${money(total)}</strong>` : `<strong class="kpi-restricted">Restrito</strong>`;
    return `<div class="summary-row"><div><strong>${escapeHtml(status)}</strong><small>${list.length} cliente(s)</small></div>${valueHtml}</div>`;
  }).join("");

  $("dashboardService").innerHTML = TICKET_SECTORS.map((sector) => {
    const list = state.tickets.filter((ticket) => ticket.setor === sector);
    const open = list.filter((ticket) => ticket.status !== "Resolvido").length;
    return `<div class="summary-row"><div><strong>${escapeHtml(sector)}</strong><small>${list.length} registro(s)</small></div><strong>${open} aberto(s)</strong></div>`;
  }).join("");

  const pendingTasks = state.tasks.filter((task) => !task.concluida).sort((a, b) => String(a.data || "").localeCompare(String(b.data || ""))).slice(0, 7);
  $("dashboardTasks").innerHTML = pendingTasks.length ? pendingTasks.map((task) => `
    <div class="record-row">
      <h4>${escapeHtml(task.titulo)}</h4>
      <p class="muted">${escapeHtml(clientName(task.cliente_id))} • ${formatDate(task.data)} • ${escapeHtml(task.prioridade)}</p>
    </div>`).join("") : emptyState("Nenhuma tarefa pendente.");

  const recent = buildRecentActivity().slice(0, 7);
  $("dashboardHistory").innerHTML = recent.length ? recent.map((item) => `
    <div class="record-row">
      <h4>${escapeHtml(item.title)}</h4>
      <p class="muted">${escapeHtml(item.client)} • ${formatDateTime(item.date)}</p>
    </div>`).join("") : emptyState("Nenhuma interação registrada.");

  $("dashboardResponseTimes").innerHTML = responseStats.agentStats.length
    ? responseStats.agentStats.map((row) => `<div class="summary-row"><div><strong>${escapeHtml(row.agent)}</strong><small>${row.count} resposta(s)</small></div><strong>${formatResponseMinutes(row.avgMinutes)}</strong></div>`).join("")
    : emptyState("Sem dados de resposta de agente ainda.");
}

function buildRecentActivity(clientId = null) {
  const history = state.history
    .filter((item) => !clientId || item.cliente_id === clientId)
    .map((item) => ({ date: item.created_at, title: item.tipo, text: item.descricao, client: clientName(item.cliente_id), author: profileName(item.created_by), kind: "history" }));

  const tickets = state.tickets
    .filter((item) => !clientId || item.cliente_id === clientId)
    .map((item) => ({ date: item.created_at, title: `Atendimento — ${item.assunto}`, text: `${item.setor} • ${item.status}${item.observacao ? ` • ${item.observacao}` : ""}`, client: clientName(item.cliente_id), author: profileName(item.created_by), kind: "ticket", origem: item.origem }));

  const tasks = state.tasks
    .filter((item) => !clientId || item.cliente_id === clientId)
    .map((item) => ({ date: item.updated_at || item.created_at, title: `Tarefa — ${item.titulo}`, text: `${item.concluida ? "Concluída" : "Pendente"} • prazo ${formatDate(item.data)} • ${item.prioridade}`, client: clientName(item.cliente_id), author: profileName(item.created_by), kind: "task" }));

  const interactions = state.interactions
    .filter((item) => !clientId || item.cliente_id === clientId)
    .map((item) => ({
      date: item.created_at,
      title: `${item.autor_tipo || "Sistema"}${item.setor ? ` — ${item.setor}` : ""}`,
      text: item.conteudo || item.evento || "Interação registrada",
      client: clientName(item.cliente_id),
      author: item.autor_nome || item.autor_tipo || "Sistema",
      kind: "interaction",
    }));

  return [...history, ...tickets, ...tasks, ...interactions].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderClients() {
  const search = $("clientSearch").value.trim().toLowerCase();
  const municipality = $("municipalityFilter").value;
  const nucleus = $("nucleusFilter").value;
  const status = $("clientStatusFilter").value;
  const owner = $("clientOwnerFilter").value;

  const municipalities = [...new Set(state.clients.map((client) => client.municipio || "Sem município informado"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("municipalityFilter").innerHTML = `<option value="">Todos os municípios</option>${municipalities.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
  $("municipalityFilter").value = municipality;

  const nucleusPool = state.clients.filter((client) => !municipality || (client.municipio || "Sem município informado") === municipality);
  const nucleusOptions = [...new Set(nucleusPool.map((client) => client.nucleo || "Sem NUI informado"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("nucleusFilter").innerHTML = `<option value="">Todos os NUIs</option>${nucleusOptions.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
  $("nucleusFilter").value = nucleusOptions.includes(nucleus) ? nucleus : "";

  const filtered = state.clients.filter((client) => {
    const haystack = [client.codigo_processo, client.nome, client.municipio, client.nucleo, client.remessa, client.telefone, client.email, client.responsavel].join(" ").toLowerCase();
    return (!search || haystack.includes(search)) &&
      (!municipality || (client.municipio || "Sem município informado") === municipality) &&
      (!nucleus || (client.nucleo || "Sem NUI informado") === nucleus) &&
      (!status || client.status === status) &&
      (!owner || client.owner_id === owner);
  });

  const municipalityGroups = filtered.reduce((acc, client) => {
    const city = client.municipio || "Sem município informado";
    (acc[city] ||= []).push(client);
    return acc;
  }, {});
  const cityCount = Object.keys(municipalityGroups).length;

  $("clientResultCount").textContent = filtered.length
    ? `${filtered.length} cliente(s) encontrado(s) em ${cityCount} município(s).`
    : "";

  if (!filtered.length) {
    $("clientsByMunicipality").innerHTML = emptyState("Nenhum cliente encontrado com esses filtros.");
    return;
  }

  const isFiltering = Boolean(search || municipality || nucleus || status || owner);
  const autoExpand = isFiltering || filtered.length <= 60;

  const MISSING_CITY = "Sem município informado";
  // "Sem município informado" fica sempre fixo no topo da listagem —
  // não faz sentido esse grupo "flutuar" no meio da ordem alfabética,
  // já que ele sinaliza cadastros incompletos que merecem atenção.
  const sortedCities = Object.keys(municipalityGroups).sort((a, b) => {
    if (a === MISSING_CITY) return -1;
    if (b === MISSING_CITY) return 1;
    return a.localeCompare(b, "pt-BR");
  });

  $("clientsByMunicipality").innerHTML = sortedCities.map((city) => {
    const clientsInCity = municipalityGroups[city];
    const isMissingCity = city === MISSING_CITY;
    const nucleusGroups = clientsInCity.reduce((acc, client) => {
      const nuc = client.nucleo || "Sem NUI informado";
      (acc[nuc] ||= []).push(client);
      return acc;
    }, {});
    const nucleusHtml = Object.keys(nucleusGroups).sort((a, b) => a.localeCompare(b, "pt-BR")).map((nuc) => `
      <details class="nucleus-group" ${autoExpand ? "open" : ""}>
        <summary>${escapeHtml(nuc)} <span>${nucleusGroups[nuc].length}</span></summary>
        <div class="client-row-list">${nucleusGroups[nuc].map(clientRow).join("")}</div>
      </details>`).join("");
    return `<details class="municipality-group${isMissingCity ? " municipality-group-missing" : ""}" ${autoExpand ? "open" : ""}>
      <summary><span class="municipality-group-title">${escapeHtml(city)}<small>${clientsInCity.length} cliente(s) • ${Object.keys(nucleusGroups).length} NUI(s)</small></span></summary>
      <div class="nucleus-groups">${nucleusHtml}</div>
    </details>`;
  }).join("");
}

function clientRow(client) {
  return `<button class="client-row" data-open-client="${client.id}">
    <div><strong>${escapeHtml(clientDisplayName(client))}</strong><span>${escapeHtml(client.telefone || client.email || "Sem contato")}</span></div>
    <div>${statusBadge(client.status)}</div>
    <div><strong>${money(client.valor_estimado)}</strong><span>Estimado</span></div>
    <div><strong>${formatDate(client.last_contact_at)}</strong><span>Último contato</span></div>
    <div><strong>${escapeHtml(profileName(client.owner_id))}</strong><span>Dono</span></div>
  </button>`;
}

function renderPipeline() {
  const search = $("pipelineSearch").value.trim().toLowerCase();
  const owner = $("pipelineOwnerFilter").value;
  const comercial = $("pipelineComercialFilter")?.value || "";
  // Cliente Ativo não aparece no Funil comercial: depois que o cliente
  // vira Cliente Ativo, o funil deixa de ser relevante para ele.
  const pipelineStatuses = CLIENT_STATUSES.filter((status) => status !== "Cliente Ativo");
  const filtered = state.clients.filter((client) => {
    const haystack = [client.codigo_processo, client.nome, client.municipio, client.nucleo, client.remessa].join(" ").toLowerCase();
    return client.status !== "Cliente Ativo" && clientHasComercial(client) && (!search || haystack.includes(search)) && (!owner || client.owner_id === owner) && (!comercial || clientComercialIds(client).includes(comercial));
  });

  $("pipelineBoard").innerHTML = pipelineStatuses.map((status) => {
    const list = filtered.filter((client) => client.status === status);
    return `<section class="kanban-column">
      <div class="kanban-head"><h3>${escapeHtml(status)}</h3><span>${list.length}</span></div>
      ${list.map((client) => `<article class="kanban-card"><button data-open-client="${client.id}"><strong>${escapeHtml(clientDisplayName(client))}</strong><span class="muted">${escapeHtml(client.municipio || "-")} • ${money(client.valor_estimado)}</span><p class="muted">${escapeHtml(client.nucleo || "Sem núcleo")}</p></button></article>`).join("")}
    </section>`;
  }).join("");
}

// Atendimento registrado direto no CRM (por um agente, na ficha do
// cliente ou no atendimento avulso) — origem "CRM" (default da
// coluna). Diferente do que era antes (clientHasComercial), que
// escondia da aba Atendimentos qualquer atendimento de um cliente sem
// Comercial atribuído, mesmo quando o agente tinha acabado de
// registrá-lo. Isso também deixa de fora os atendimentos criados
// automaticamente pelo webhook do Chatwoot (origem "Chatwoot") a cada
// conversa nova do WhatsApp, que não são ações de um agente no CRM.
function isCrmTicket(ticket) {
  return ticket.origem === "CRM";
}

function canDeleteOperationalRecord(record) {
  return isAdmin() || record?.created_by === state.user?.id;
}

async function recordUserActivity({ userId, type, description, entity, entityId, data }) {
  const targetUser = userId || state.user.id;
  const { error } = await supabase.from("usuario_historico").insert({
    usuario_id: targetUser,
    executado_por: state.user.id,
    tipo: type,
    descricao: description,
    entidade: entity,
    entidade_id: entityId || null,
    dados: data || null,
  });
  if (error) console.warn("Não foi possível registrar histórico do usuário:", error);
  return !error;
}

function renderTickets() {
  const search = $("ticketSearch").value.trim().toLowerCase();
  const municipality = $("ticketMunicipalityFilter").value;
  const nucleus = $("ticketNucleusFilter").value;
  const agent = $("ticketAgentFilter").value;
  const status = $("ticketStatusFilter").value;

  const crmTicketsPool = state.tickets.filter(isCrmTicket);

  const municipalities = [...new Set(crmTicketsPool.map((ticket) => clientMunicipio(ticket.cliente_id)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("ticketMunicipalityFilter").innerHTML = `<option value="">Todos os municípios</option>${municipalities.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
  $("ticketMunicipalityFilter").value = municipality;

  const nucleusPool = crmTicketsPool.filter((ticket) => !municipality || clientMunicipio(ticket.cliente_id) === municipality);
  const nucleusOptions = [...new Set(nucleusPool.map((ticket) => clientNucleo(ticket.cliente_id)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("ticketNucleusFilter").innerHTML = `<option value="">Todos os NUIs</option>${nucleusOptions.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
  $("ticketNucleusFilter").value = nucleusOptions.includes(nucleus) ? nucleus : "";

  // Agentes que registraram atendimento no CRM (created_by), não os
  // setores — a aba já mostra o setor de cada atendimento na lista.
  const agentIds = [...new Set(crmTicketsPool.map((ticket) => ticket.created_by).filter(Boolean))]
    .sort((a, b) => profileName(a).localeCompare(profileName(b), "pt-BR"));
  $("ticketAgentFilter").innerHTML = `<option value="">Todos os agentes</option>${agentIds.map((id) => `<option value="${id}">${escapeHtml(profileName(id))}</option>`).join("")}`;
  $("ticketAgentFilter").value = agentIds.includes(agent) ? agent : "";

  const filtered = state.tickets.filter((ticket) => {
    const haystack = [ticket.assunto, ticket.observacao, clientName(ticket.cliente_id)].join(" ").toLowerCase();
    return isCrmTicket(ticket) && (!search || haystack.includes(search)) &&
      (!municipality || clientMunicipio(ticket.cliente_id) === municipality) &&
      (!nucleus || clientNucleo(ticket.cliente_id) === nucleus) &&
      (!agent || ticket.created_by === agent) && (!status || ticket.status === status);
  });

  $("ticketResultCount").textContent = filtered.length ? `${filtered.length} atendimento(s) encontrado(s).` : "";

  const visible = filtered.slice(0, state.ticketsVisible);
  $("ticketsList").innerHTML = visible.length ? visible.map((ticket) => `
    <article class="record-row">
      <div><h4>${escapeHtml(ticket.assunto)}</h4><p class="muted">${escapeHtml(clientName(ticket.cliente_id))} • ${escapeHtml(clientMunicipio(ticket.cliente_id))} / ${escapeHtml(clientNucleo(ticket.cliente_id))}</p></div>
      <div>${statusBadge(ticket.status)}</div>
      <div><strong>${escapeHtml(ticket.setor)}</strong><p class="muted">${formatDateTime(ticket.created_at)}</p></div>
      <div><span>${escapeHtml(ticket.observacao || "Sem observação")}</span></div>
      <div class="record-actions">
        <button class="secondary small-button" data-open-client="${ticket.cliente_id}">Abrir cliente</button>
        ${ticket.status !== "Resolvido" ? `<button class="primary small-button" data-resolve-ticket="${ticket.id}">Resolver</button>` : ""}
        ${canDeleteOperationalRecord(ticket) ? `<button class="danger small-button" data-delete-ticket="${ticket.id}">Excluir</button>` : ""}
      </div>
    </article>`).join("") : emptyState("Nenhum atendimento encontrado.");

  $("ticketsLoadMore").classList.toggle("hidden", filtered.length <= visible.length);
}

function renderTasks() {
  const search = $("taskSearch").value.trim().toLowerCase();
  const municipality = $("taskMunicipalityFilter").value;
  const nucleus = $("taskNucleusFilter").value;
  const stateFilter = $("taskStateFilter").value;

  const municipalities = [...new Set(state.tasks.map((task) => clientMunicipio(task.cliente_id)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("taskMunicipalityFilter").innerHTML = `<option value="">Todos os municípios</option>${municipalities.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
  $("taskMunicipalityFilter").value = municipality;

  const nucleusPool = state.tasks.filter((task) => !municipality || clientMunicipio(task.cliente_id) === municipality);
  const nucleusOptions = [...new Set(nucleusPool.map((task) => clientNucleo(task.cliente_id)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("taskNucleusFilter").innerHTML = `<option value="">Todos os NUIs</option>${nucleusOptions.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
  $("taskNucleusFilter").value = nucleusOptions.includes(nucleus) ? nucleus : "";

  const filtered = state.tasks.filter((task) => {
    const haystack = [task.titulo, clientName(task.cliente_id), profileName(task.assigned_to)].join(" ").toLowerCase();
    const matchesState = stateFilter === "all" || (stateFilter === "done" ? task.concluida : !task.concluida);
    return (!search || haystack.includes(search)) &&
      (!municipality || clientMunicipio(task.cliente_id) === municipality) &&
      (!nucleus || clientNucleo(task.cliente_id) === nucleus) &&
      matchesState;
  });

  $("taskResultCount").textContent = filtered.length ? `${filtered.length} tarefa(s) encontrada(s).` : "";

  const visible = filtered.slice(0, state.tasksVisible);
  $("tasksList").innerHTML = visible.length ? visible.map((task) => `
    <article class="record-row">
      <div><h4>${task.concluida ? "✓ " : ""}${escapeHtml(task.titulo)}</h4><p class="muted">${escapeHtml(clientName(task.cliente_id))} • ${escapeHtml(clientMunicipio(task.cliente_id))} / ${escapeHtml(clientNucleo(task.cliente_id))}</p></div>
      <div><strong>${formatDate(task.data)}</strong><p class="muted">Prazo</p></div>
      <div><strong>${escapeHtml(task.prioridade)}</strong><p class="muted">Prioridade</p></div>
      <div><strong>${escapeHtml(profileName(task.assigned_to))}</strong><p class="muted">Responsável</p></div>
      <div class="record-actions">
        <button class="secondary small-button" data-open-client="${task.cliente_id}">Abrir cliente</button>
        <button class="primary small-button" data-toggle-task="${task.id}">${task.concluida ? "Reabrir" : "Concluir"}</button>
        ${canDeleteOperationalRecord(task) ? `<button class="danger small-button" data-delete-task="${task.id}">Excluir</button>` : ""}
      </div>
    </article>`).join("") : emptyState("Nenhuma tarefa encontrada.");

  $("tasksLoadMore").classList.toggle("hidden", filtered.length <= visible.length);
}

function renderUsers() {
  if (!isAdmin()) return;

  $("usersCount").textContent = state.profiles.length;
  const roleLabels = { usuario: "Usuário", comercial: "Comercial", marketing: "Marketing", admin: "Administrador" };

  const historyFor = (profile) => {
    const persisted = state.userHistory
      .filter((item) => item.usuario_id === profile.id)
      .map((item) => ({
        date: item.created_at,
        type: item.tipo || "Atividade",
        text: item.descricao || "Sem descrição",
        entity: item.entidade || "",
        entityId: item.entidade_id || "",
      }));
    const keys = new Set(persisted.map((item) => `${item.entity}:${item.entityId}:${item.type}`));
    const currentTickets = state.tickets
      .filter((item) => isCrmTicket(item) && item.created_by === profile.id)
      .filter((item) => !keys.has(`atendimento:${item.id}:Atendimento criado`))
      .map((item) => ({ date: item.created_at, type: "Atendimento criado", text: `${item.assunto || "Sem assunto"} • ${clientName(item.cliente_id)} • ${item.setor || "Sem setor"}` }));
    const currentTasks = state.tasks
      .filter((item) => item.created_by === profile.id)
      .filter((item) => !keys.has(`tarefa:${item.id}:Tarefa criada`))
      .map((item) => ({ date: item.created_at || item.data, type: "Tarefa criada", text: `${item.titulo || "Sem título"} • ${clientName(item.cliente_id)}${item.data ? ` • Prazo ${formatDate(item.data)}` : ""}` }));
    return [...persisted, ...currentTickets, ...currentTasks]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 40);
  };

  $("usersList").innerHTML = state.profiles.length ? state.profiles.map((profile) => {
    const activities = historyFor(profile);
    return `<article class="user-admin-card user-admin-card-with-history">
      <div class="user-admin-card-head">
        <div>
          <strong>${escapeHtml(profile.nome || profile.apelido || "Usuário")}</strong>
          <span class="muted">${escapeHtml(profile.email || "E-mail não informado")}</span>
        </div>
        <div class="user-card-head-actions">
          <span class="badge ${profile.ativo ? "closed" : "lost"}">${profile.ativo ? "Ativo" : "Inativo"}</span>
          <button type="button" class="secondary small-button" data-edit-user="${profile.id}">Editar usuário</button>
        </div>
      </div>
      <div class="user-admin-card-meta">
        <span><b>Setor:</b> ${escapeHtml(profile.setor || "—")}</span>
        <span><b>Função:</b> ${escapeHtml(roleLabels[profile.perfil] || "Usuário")}</span>
        <span><b>Usuário:</b> ${profile.apelido ? `@${escapeHtml(profile.apelido)}` : "—"}</span>
        <span><b>Histórico:</b> ${activities.length} registro(s)</span>
      </div>
      <details class="user-activity-history">
        <summary>Histórico de atendimentos e tarefas</summary>
        <div class="user-activity-list">
          ${activities.length ? activities.map((item) => `<div class="user-activity-item"><div><strong>${escapeHtml(item.type)}</strong><span>${escapeHtml(item.text)}</span></div><time>${formatDateTime(item.date)}</time></div>`).join("") : `<div class="empty compact">Nenhum atendimento ou tarefa registrado por este usuário.</div>`}
        </div>
      </details>
    </article>`;
  }).join("") : emptyState("Nenhum usuário encontrado.");
}

function marketingProgressFor(projectId) {
  const rows = state.marketingProgress.filter((row) => row.projeto_id === projectId);
  const total = state.marketingEtapas.length;
  const done = rows.filter((row) => row.concluida).length;
  const pendingEtapas = state.marketingEtapas
    .filter((etapa) => !rows.find((row) => row.etapa_id === etapa.id)?.concluida)
    .sort((a, b) => a.ordem - b.ordem);
  const currentFase = pendingEtapas.length ? pendingEtapas[0].fase_numero : (state.marketingEtapas[state.marketingEtapas.length - 1]?.fase_numero || 1);
  const currentFaseNome = pendingEtapas.length ? pendingEtapas[0].fase_nome : "Jornada concluída";
  return { total, done, rows, currentFase, currentFaseNome, completed: total > 0 && done === total };
}


function projectClientCount(projectId) {
  return state.clients.filter((client) => client.projeto_id === projectId).length;
}

function latestProjectProgress(projectId) {
  return state.projectProgress.find((item) => item.projeto_id === projectId);
}

function renderBreadcrumb(elementId, items, crumbAttr) {
  const el = $(elementId);
  if (!el) return;
  el.innerHTML = items.map((item, idx) => {
    const isLast = idx === items.length - 1;
    const label = escapeHtml(item.label);
    if (isLast) return `<span class="breadcrumb-current">${label}</span>`;
    return `<button type="button" class="breadcrumb-link" data-${crumbAttr}="${item.action}">${label}</button><span class="breadcrumb-sep">/</span>`;
  }).join("");
}

function projectCardHtml(project, { selectable = true } = {}) {
  const last = latestProjectProgress(project.id);
  return `<article class="project-card">
    <div class="project-card-head">
      <div><p class="eyebrow">${escapeHtml(project.cidade)}/${escapeHtml(project.estado)}</p><h3>${escapeHtml(project.nome)}</h3></div>
      <span class="badge ${project.ativo ? "closed" : "lost"}">${project.ativo ? "Ativo" : "Inativo"}</span>
    </div>
    <div class="project-card-stats">
      <div><strong>${projectClientCount(project.id)}</strong><span>clientes vinculados</span></div>
      <div><strong>${escapeHtml(last?.status || "Sem andamento")}</strong><span>status atual</span></div>
    </div>
    <p class="muted">${escapeHtml(last?.descricao_cliente || project.observacoes || "Sem observações registradas.")}</p>
    <div class="project-card-actions">
      ${selectable ? `<button class="secondary small-button" type="button" data-select-project="${project.id}">Ver detalhes</button>` : ""}
      ${canManageProject(project) ? `<button class="secondary small-button" type="button" data-edit-project="${project.id}">Editar</button>` : ""}
      ${isAdmin() ? `<button class="danger small-button" type="button" data-delete-project="${project.id}">Excluir</button>` : ""}
    </div>
  </article>`;
}

function renderProjects() {
  if (!$("projectsGrid")) return;
  $("projectSchemaNotice").classList.toggle("hidden", state.projectSchemaReady);
  $("newProjectButton").disabled = !state.projectSchemaReady;

  if (!state.projectSchemaReady) {
    $("projectsGrid").innerHTML = "";
    if ($("projectsBreadcrumb")) $("projectsBreadcrumb").innerHTML = "";
    return;
  }

  const search = $("projectSearch").value.trim().toLowerCase();
  const uf = $("projectStateFilter").value;
  const activeFilter = $("projectActiveFilter").value;

  const states = [...new Set(state.projects.map((p) => p.estado).filter(Boolean))].sort();
  $("projectStateFilter").innerHTML = `<option value="">Todos os estados</option>${states.map((item) => `<option>${escapeHtml(item)}</option>`).join("")}`;
  $("projectStateFilter").value = states.includes(uf) ? uf : "";

  const drill = state.projectsDrill;
  const groups = groupProjectsByMunicipio(state.projects);

  // Valida o estado de navegação contra os dados disponíveis.
  if (drill.municipio && !groups.some((g) => g.key === drill.municipio)) {
    drill.municipio = null;
    drill.projetoId = null;
  }
  if (drill.projetoId && !projectById(drill.projetoId)) drill.projetoId = null;

  if ($("projectStateFilter")) $("projectStateFilter").classList.toggle("hidden", !!drill.municipio);
  if ($("projectActiveFilter")) $("projectActiveFilter").classList.toggle("hidden", !drill.municipio || !!drill.projetoId);
  if ($("projectSearch")) $("projectSearch").classList.toggle("hidden", !!drill.projetoId);

  // ---- Nível 3: detalhe do projeto ----
  if (drill.municipio && drill.projetoId) {
    const project = projectById(drill.projetoId);
    const group = groups.find((g) => g.key === drill.municipio);
    renderBreadcrumb("projectsBreadcrumb", [
      { label: "Municípios", action: "root" },
      { label: `${group.cidade}/${group.estado}`, action: `municipio:${drill.municipio}` },
      { label: project.nome },
    ], "projects-crumb");

    const last = latestProjectProgress(project.id);
    const history = state.projectProgress
      .filter((row) => row.projeto_id === project.id)
      .sort((a, b) => new Date(b.data_atualizacao || b.created_at) - new Date(a.data_atualizacao || a.created_at))
      .slice(0, 3);

    $("projectsGrid").innerHTML = `
      <article class="panel project-detail-panel">
        <div class="project-card-head">
          <div><p class="eyebrow">${escapeHtml(project.cidade)}/${escapeHtml(project.estado)}</p><h2>${escapeHtml(project.nome)}</h2></div>
          <span class="badge ${project.ativo ? "closed" : "lost"}">${project.ativo ? "Ativo" : "Inativo"}</span>
        </div>
        <div class="project-card-stats">
          <div><strong>${projectClientCount(project.id)}</strong><span>clientes vinculados</span></div>
          <div><strong>${escapeHtml(last?.status || "Sem andamento")}</strong><span>status atual</span></div>
        </div>
        <p class="muted">${escapeHtml(project.observacoes || "Sem observações registradas.")}</p>
        <div class="project-card-actions">
          <button class="primary small-button" type="button" data-open-project-progress="${project.id}">Ver andamentos completos</button>
          ${canManageProject(project) ? `<button class="secondary small-button" type="button" data-edit-project="${project.id}">Editar projeto</button>` : ""}
          ${isAdmin() ? `<button class="danger small-button" type="button" data-delete-project="${project.id}">Excluir projeto</button>` : ""}
        </div>
        ${history.length ? `<div class="project-timeline" style="margin-top:18px">
          ${history.map((item) => `<div class="project-timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-title"><div><strong>${escapeHtml(item.status)}</strong></div><time>${formatDate(item.data_atualizacao || item.created_at)}</time></div>
              <p>${escapeHtml(item.descricao_cliente)}</p>
            </div>
          </div>`).join("")}
        </div>` : `<p class="muted" style="margin-top:16px">Nenhum andamento registrado ainda.</p>`}
      </article>`;
    return;
  }

  // ---- Nível 2: projetos do município ----
  if (drill.municipio) {
    const group = groups.find((g) => g.key === drill.municipio);
    if (!group) { drill.municipio = null; renderProjects(); return; }
    renderBreadcrumb("projectsBreadcrumb", [
      { label: "Municípios", action: "root" },
      { label: `${group.cidade}/${group.estado}` },
    ], "projects-crumb");

    const filtered = group.projects.filter((project) => {
      const haystack = [project.nome, project.observacoes].join(" ").toLowerCase();
      const matchesActive = activeFilter === "all" || (activeFilter === "active" ? project.ativo : !project.ativo);
      return (!search || haystack.includes(search)) && matchesActive;
    });

    $("projectsGrid").innerHTML = filtered.length
      ? filtered.map((project) => projectCardHtml(project)).join("")
      : emptyState("Nenhum projeto encontrado neste município.");
    return;
  }

  // ---- Nível 1: municípios ----
  renderBreadcrumb("projectsBreadcrumb", [{ label: "Municípios" }], "projects-crumb");

  const filteredGroups = groups.filter((group) => {
    const haystack = `${group.cidade} ${group.estado}`.toLowerCase();
    return (!search || haystack.includes(search)) && (!uf || group.estado === uf);
  });

  $("projectsGrid").innerHTML = filteredGroups.length ? filteredGroups.map((group) => {
    const activeCount = group.projects.filter((p) => p.ativo).length;
    const clientTotal = group.projects.reduce((sum, p) => sum + projectClientCount(p.id), 0);
    return `<button type="button" class="project-card municipio-card" data-select-municipio="${group.key}">
      <div class="project-card-head"><div><p class="eyebrow">${escapeHtml(group.estado)}</p><h3>${escapeHtml(group.cidade)}</h3></div></div>
      <div class="project-card-stats">
        <div><strong>${group.projects.length}</strong><span>projeto(s) • ${activeCount} ativo(s)</span></div>
        <div><strong>${clientTotal}</strong><span>clientes vinculados</span></div>
      </div>
    </button>`;
  }).join("") : emptyState("Nenhum município encontrado.");
}

function renderProjectProgress() {
  if (!$("progressProjectsList")) return;

  $("progressSchemaNotice").classList.toggle("hidden", state.projectSchemaReady);
  $("newProgressButton").disabled = !state.projectSchemaReady;

  if (!state.projectSchemaReady) {
    $("progressProjectsList").innerHTML = "";
    $("progressSummary").innerHTML = "";
    if ($("progressBreadcrumb")) $("progressBreadcrumb").innerHTML = "";
    return;
  }

  const drill = state.progressDrill;
  const groups = groupProjectsByMunicipio(state.projects);

  if (drill.municipio && !groups.some((g) => g.key === drill.municipio)) {
    drill.municipio = null;
    drill.projetoId = null;
  }
  if (drill.projetoId && !projectById(drill.projetoId)) drill.projetoId = null;

  const search = $("progressSearch").value.trim().toLowerCase();
  const status = $("progressStatusFilter").value;
  const selectedState = $("progressStateFilter").value;
  const activity = $("progressActivityFilter").value;

  const availableStates = [...new Set(state.projects.map((p) => p.estado).filter(Boolean))].sort();
  const currentStateValue = $("progressStateFilter").value;
  $("progressStateFilter").innerHTML =
    `<option value="">Todos os estados</option>` +
    availableStates.map((uf) => `<option value="${escapeHtml(uf)}">${escapeHtml(uf)}</option>`).join("");
  $("progressStateFilter").value = availableStates.includes(currentStateValue) ? currentStateValue : "";

  $("progressStateFilter").classList.toggle("hidden", !!drill.municipio);
  $("progressStatusFilter").classList.toggle("hidden", !drill.municipio || !!drill.projetoId);
  $("progressActivityFilter").classList.toggle("hidden", !drill.municipio || !!drill.projetoId);
  $("progressSearch").classList.toggle("hidden", !!drill.projetoId);

  const allProjectsWithMeta = state.projects.map((project) => {
    const items = state.projectProgress
      .filter((row) => row.projeto_id === project.id)
      .sort((a, b) => {
        const da = new Date(a.data_atualizacao || a.created_at || 0);
        const db = new Date(b.data_atualizacao || b.created_at || 0);
        return db - da;
      });
    return {
      project,
      items,
      current: items[0] || null,
      clientCount: projectClientCount(project.id),
    };
  });

  // ---- Nível 3: histórico completo de um projeto ----
  if (drill.municipio && drill.projetoId) {
    const meta = allProjectsWithMeta.find((m) => m.project.id === drill.projetoId);
    if (!meta) { drill.projetoId = null; renderProjectProgress(); return; }
    const { project, items, clientCount } = meta;

    renderBreadcrumb("progressBreadcrumb", [
      { label: "Municípios", action: "root" },
      { label: `${project.cidade}/${project.estado}`, action: `municipio:${drill.municipio}` },
      { label: project.nome },
    ], "progress-crumb");

    $("progressSummary").innerHTML = "";
    $("progressResultsTitle").textContent = project.nome;
    $("progressResultsCount").textContent = `${items.length} registro(s) • ${clientCount} cliente(s) vinculado(s)`;

    $("progressProjectsList").innerHTML = `
      <div class="progress-row-details-head" style="padding:18px 20px 0">
        <div>
          <strong>Histórico de andamentos</strong>
          <span class="muted">Atualizações vinculadas a todos os clientes deste Projeto/Núcleo.</span>
        </div>
        <button class="primary small-button" type="button" data-new-progress-project="${project.id}">+ Registrar andamento</button>
      </div>
      <div class="project-timeline" style="padding:18px 20px">
        ${items.length ? items.map((item) => `<div class="project-timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="timeline-title">
              <div>
                <strong>${escapeHtml(item.status)}</strong>
                <span class="ai-visibility">${item.visivel_ia ? "Disponível para IA" : "Somente equipe"}</span>
              </div>
              <time>${formatDate(item.data_atualizacao || item.created_at)}</time>
            </div>
            <p>${escapeHtml(item.descricao_cliente)}</p>
            ${item.observacao_interna ? `<details>
              <summary>Observação interna</summary>
              <p class="muted">${escapeHtml(item.observacao_interna)}</p>
            </details>` : ""}
            <div class="timeline-actions">
              <button class="secondary small-button" type="button" data-edit-progress="${item.id}">Editar andamento</button>
              <button class="danger-text-button" type="button"
                data-delete-progress="${item.id}"
                data-delete-progress-project="${project.id}">
                Excluir andamento
              </button>
            </div>
          </div>
        </div>`).join("") : emptyState("Nenhum andamento registrado para este projeto.")}
      </div>`;
    return;
  }

  // ---- Nível 2: projetos do município ----
  if (drill.municipio) {
    const group = groups.find((g) => g.key === drill.municipio);
    if (!group) { drill.municipio = null; renderProjectProgress(); return; }

    renderBreadcrumb("progressBreadcrumb", [
      { label: "Municípios", action: "root" },
      { label: `${group.cidade}/${group.estado}` },
    ], "progress-crumb");

    let metas = allProjectsWithMeta.filter((m) => municipioKeyOf(m.project) === drill.municipio);
    metas = metas.filter(({ project, items, current }) => {
      const text = [project.nome, project.observacoes, ...items.map((row) => `${row.status} ${row.descricao_cliente || ""}`)].join(" ").toLowerCase();
      const statusMatch = !status || current?.status === status || items.some((row) => row.status === status);
      const activityMatch =
        activity === "all" ||
        (activity === "with_progress" && items.length > 0) ||
        (activity === "without_progress" && items.length === 0);
      return (!search || text.includes(search)) && statusMatch && activityMatch;
    });

    const withProgress = metas.filter((m) => m.items.length > 0).length;
    $("progressSummary").innerHTML = `
      <article class="progress-summary-card"><span>Projetos no município</span><strong>${group.projects.length}</strong></article>
      <article class="progress-summary-card"><span>Com atualização</span><strong>${withProgress}</strong></article>
      <article class="progress-summary-card"><span>Sem andamento</span><strong>${group.projects.length - withProgress}</strong></article>
      <article class="progress-summary-card"><span>Clientes vinculados</span><strong>${group.projects.reduce((sum, p) => sum + projectClientCount(p.id), 0)}</strong></article>`;

    $("progressResultsTitle").textContent = `${group.cidade}/${group.estado}`;
    $("progressResultsCount").textContent = `${metas.length} de ${group.projects.length} projeto(s)`;

    $("progressProjectsList").innerHTML = metas.length ? metas.map(({ project, items, current, clientCount }) => {
      const lastDate = current ? formatDate(current.data_atualizacao || current.created_at) : "Sem atualização";
      const statusText = current?.status || "Sem andamento";
      const publicText = current?.descricao_cliente || "Nenhuma atualização registrada para este Projeto/Núcleo.";
      return `<button type="button" class="progress-row-summary" data-select-progress-project="${project.id}">
        <div class="progress-row-project">
          <div>
            <strong>${escapeHtml(project.nome)}</strong>
            <span>${clientCount} cliente(s) vinculado(s)</span>
          </div>
        </div>
        <div class="progress-row-status">
          <span class="progress-status-chip">${escapeHtml(statusText)}</span>
          <span class="muted">${escapeHtml(lastDate)}</span>
        </div>
        <div class="progress-row-text">${escapeHtml(publicText)}</div>
        <div class="progress-row-count">${items.length} registro(s)</div>
      </button>`;
    }).join("") : emptyState("Nenhum projeto encontrado com os filtros selecionados.");
    return;
  }

  // ---- Nível 1: municípios ----
  renderBreadcrumb("progressBreadcrumb", [{ label: "Municípios" }], "progress-crumb");

  let filteredGroups = groups;
  if (selectedState) filteredGroups = filteredGroups.filter((g) => g.estado === selectedState);
  if (search) filteredGroups = filteredGroups.filter((g) => `${g.cidade} ${g.estado}`.toLowerCase().includes(search));

  const totalProjects = state.projects.length;
  const withProgressTotal = allProjectsWithMeta.filter((m) => m.items.length > 0).length;
  $("progressSummary").innerHTML = `
    <article class="progress-summary-card"><span>Total de projetos</span><strong>${totalProjects}</strong></article>
    <article class="progress-summary-card"><span>Com atualização</span><strong>${withProgressTotal}</strong></article>
    <article class="progress-summary-card"><span>Sem andamento</span><strong>${totalProjects - withProgressTotal}</strong></article>
    <article class="progress-summary-card"><span>Municípios</span><strong>${groups.length}</strong></article>`;

  $("progressResultsTitle").textContent = "Municípios";
  $("progressResultsCount").textContent = `${filteredGroups.length} de ${groups.length} município(s)`;

  $("progressProjectsList").innerHTML = filteredGroups.length ? filteredGroups.map((group) => {
    const metas = allProjectsWithMeta.filter((m) => municipioKeyOf(m.project) === group.key);
    const withProgress = metas.filter((m) => m.items.length > 0).length;
    return `<button type="button" class="progress-row-summary" data-select-progress-municipio="${group.key}">
      <div class="progress-row-project">
        <div>
          <strong>${escapeHtml(group.cidade)}/${escapeHtml(group.estado)}</strong>
          <span>${group.projects.length} projeto(s)</span>
        </div>
      </div>
      <div class="progress-row-status">
        <span class="progress-status-chip">${withProgress} com atualização</span>
      </div>
      <div class="progress-row-text muted">${group.projects.length - withProgress} sem andamento registrado</div>
      <div class="progress-row-count"></div>
    </button>`;
  }).join("") : emptyState("Nenhum município encontrado.");
}

async function deleteProject(projectId) {
  const project = projectById(projectId);
  if (!project) return showToast("Projeto não encontrado.", "error");

  const clientCount = projectClientCount(projectId);
  const progressCount = state.projectProgress.filter((row) => row.projeto_id === projectId).length;
  const confirmed = window.confirm(
    `Excluir o projeto/núcleo "${project.nome}" (${project.cidade}/${project.estado})?\n\n` +
    `Isso apaga também ${progressCount} andamento(s) registrado(s) dele${clientCount ? ` e desvincula ${clientCount} cliente(s) (eles continuam cadastrados, só perdem o vínculo com este projeto)` : ""}.\n\n` +
    `Esta ação não pode ser desfeita.`
  );
  if (!confirmed) return;

  const { error } = await supabase.from("projetos").delete().eq("id", projectId);
  if (error) return showToast(friendlyErrorMessage(error), "error");

  if (state.projectsDrill.projetoId === projectId) state.projectsDrill.projetoId = null;
  if (state.progressDrill.projetoId === projectId) state.progressDrill.projetoId = null;
  if (state.projectsDrill.municipio && !state.projects.some((p) => p.id !== projectId && municipioKeyOf(p) === state.projectsDrill.municipio)) {
    state.projectsDrill.municipio = null;
  }

  await loadData();
  showToast("Projeto/núcleo excluído.");
}

async function deleteProjectProgress(progressId, projectId) {
  const item = state.projectProgress.find((row) => row.id === progressId);
  if (!item) return showToast("Andamento não encontrado.", "error");

  const project = projectById(projectId || item.projeto_id);
  const confirmed = window.confirm(
    `Excluir este andamento de "${project?.nome || "Projeto/Núcleo"}"?\n\n` +
    `Status: ${item.status}\n` +
    `Data: ${formatDate(item.data_atualizacao || item.created_at)}\n\n` +
    `Esta ação remove somente este registro de andamento. O projeto e os clientes não serão excluídos.`
  );

  if (!confirmed) return;

  const { error } = await supabase.from("andamentos").delete().eq("id", progressId);
  if (error) return showToast(friendlyErrorMessage(error), "error");

  await loadData();
  showToast("Andamento excluído.");
}

function openProjectDialog(project = null, prefill = null) {
  if (!state.projectSchemaReady) return showToast("Primeiro aplique a migração de Projetos no Supabase.", "error");
  $("projectForm").reset();
  $("projectId").value = project?.id || "";
  $("projectDialogTitle").textContent = project ? "Editar projeto" : "Novo projeto";
  $("projectName").value = project?.nome || "";
  $("projectCity").value = project?.cidade || prefill?.cidade || "";
  $("projectState").value = project?.estado || prefill?.estado || "";
  $("projectSigla").value = project?.sigla || prefill?.sigla || "";
  $("projectActive").value = String(project?.ativo ?? true);
  $("projectNotes").value = project?.observacoes || "";
  if ($("projectComerciais")) {
    const comercialIds = new Set(project?.comercial_ids || []);
    [...$("projectComerciais").options].forEach((option) => {
      option.selected = comercialIds.has(option.value);
    });
    $("projectComerciais").disabled = !canManageProjectComerciais(project);
  }
  $("projectDialog").showModal();
}

async function saveProject(event) {
  event.preventDefault();
  const id = $("projectId").value;
  const existingProject = id ? projectById(id) : null;
  const comercialIds = canManageProjectComerciais(existingProject)
    ? [...($("projectComerciais")?.selectedOptions || [])].map((option) => option.value)
    : (existingProject?.comercial_ids ?? []);
  const payload = {
    nome: $("projectName").value.trim(),
    cidade: $("projectCity").value.trim(),
    estado: $("projectState").value.trim().toUpperCase(),
    sigla: $("projectSigla").value.trim().toUpperCase() || null,
    ativo: $("projectActive").value === "true",
    observacoes: $("projectNotes").value.trim() || null,
    comercial_ids: comercialIds,
  };
  let result;
  if (id) result = await supabase.from("projetos").update(payload).eq("id", id);
  else result = await supabase.from("projetos").insert({ ...payload, created_by: state.user.id });
  if (result.error) return showToast(friendlyErrorMessage(result.error), "error");
  $("projectDialog").close();
  if (!id) {
    state.projectsDrill.municipio = municipioKeyOf(payload);
    state.projectsDrill.projetoId = null;
  }
  await loadData();
  showToast(id ? "Projeto atualizado." : "Projeto criado.");
}

function openProgressDialog(projectId = "", progressItem = null) {
  if (!state.projectSchemaReady) return showToast("Primeiro aplique a migração de Andamentos no Supabase.", "error");
  $("progressForm").reset();
  state.editingProgressId = progressItem?.id || null;
  $("progressDate").value = progressItem?.data_atualizacao || today();
  if ($("progressOperationalStatus")) $("progressOperationalStatus").value = progressItem?.status_operacional || "Em andamento";
  if ($("progressForecast")) $("progressForecast").value = progressItem?.previsao || "";
  if ($("progressAiGuidance")) $("progressAiGuidance").value = progressItem?.orientacao_ia || "";
  $("progressVisibleAi").checked = progressItem ? progressItem.visivel_ia !== false : true;
  $("progressProject").value = progressItem?.projeto_id || projectId;
  $("progressProject").disabled = !!progressItem;
  $("progressStatus").value = progressItem?.status || "Topografia";
  $("progressPublicText").value = progressItem?.descricao_cliente || "";
  $("progressInternalText").value = progressItem?.observacao_interna || "";
  const title = $("progressDialog").querySelector(".dialog-head h2");
  if (title) title.textContent = progressItem ? "Editar andamento" : "Novo andamento";
  const submit = $("progressForm").querySelector('button[type="submit"]');
  if (submit) submit.textContent = progressItem ? "Salvar alterações" : "Registrar andamento";
  $("progressDialog").showModal();
}

async function saveProjectProgress(event) {
  event.preventDefault();
  const editingId = state.editingProgressId;
  const existing = editingId ? state.projectProgress.find((row) => row.id === editingId) : null;
  const projetoId = existing?.projeto_id || $("progressProject").value;
  const payload = {
    projeto_id: projetoId,
    status: $("progressStatus").value,
    descricao_cliente: $("progressPublicText").value.trim(),
    status_operacional: $("progressOperationalStatus")?.value || "Em andamento",
    previsao: $("progressForecast")?.value || null,
    orientacao_ia: $("progressAiGuidance")?.value.trim() || null,
    observacao_interna: $("progressInternalText").value.trim() || null,
    visivel_ia: $("progressVisibleAi").checked,
    data_atualizacao: $("progressDate").value,
  };

  let result;
  if (existing) result = await supabase.from("andamentos").update(payload).eq("id", existing.id);
  else result = await supabase.from("andamentos").insert({ ...payload, created_by: state.user.id });
  if (result.error) return showToast(friendlyErrorMessage(result.error), "error");

  $("progressProject").disabled = false;
  $("progressDialog").close();
  state.editingProgressId = null;
  const project = projectById(projetoId);
  if (project) {
    state.progressDrill.municipio = municipioKeyOf(project);
    state.progressDrill.projetoId = project.id;
  }
  await loadData();
  setView("andamentos");
  showToast(existing ? "Andamento atualizado." : "Andamento registrado para todo o Projeto/Núcleo.");
}

function applyProjectToClientForm() {
  const project = projectById($("clientProject").value);
  if (!project) return;
  $("clientState").value = project.estado || "";
  $("clientMunicipality").value = project.cidade || "";
  $("clientNucleus").value = project.nome || "";
}

function renderMarketingProjects() {
  if (!isMarketingTeam()) return;
  const search = $("marketingSearch").value.trim().toLowerCase();
  const statusFilter = $("marketingStatusFilter").value;

  const filtered = state.marketingProjects.filter((project) => {
    const matchesSearch = !search || project.municipio.toLowerCase().includes(search);
    const progress = marketingProgressFor(project.id);
    const matchesStatus = !statusFilter || (statusFilter === "concluido" ? progress.completed : !progress.completed);
    return matchesSearch && matchesStatus;
  });

  $("marketingProjectsGrid").innerHTML = filtered.length
    ? filtered.map(marketingProjectCard).join("")
    : emptyState("Nenhum município cadastrado no controle de marketing.");
}

function marketingProjectCard(project) {
  const progress = marketingProgressFor(project.id);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const color = MARKETING_FASE_COLORS[progress.currentFase] || "var(--primary)";
  return `<article class="marketing-project-card">
    <button data-open-marketing-project="${project.id}">
      <div class="marketing-project-head">
        <h3>${escapeHtml(projectById(project.projeto_id)?.nome || project.municipio)}</h3>
        <span class="marketing-phase-pill" style="background:${color}">${escapeHtml(progress.currentFaseNome)}</span>
      </div>
      <div class="marketing-progress-bar"><div class="marketing-progress-fill" style="width:${pct}%; background:${color}"></div></div>
      <div class="marketing-progress-label"><span>${progress.done} de ${progress.total} etapas</span><span>${pct}%</span></div>
    </button>
  </article>`;
}

function openMarketingProjectDialog() {
  $("marketingProjectForm").reset();
  $("marketingProjectDialog").showModal();
}

async function saveMarketingProject(event) {
  event.preventDefault();
  const projetoId = $("marketingProjectSelect").value;
  const linkedProject = projectById(projetoId);
  if (!linkedProject) return showToast("Selecione um Projeto/Núcleo cadastrado.", "error");
  const { error } = await supabase.from("marketing_projetos").insert({
    projeto_id: projetoId,
    municipio: linkedProject.cidade,
    observacoes: $("marketingObservacoes").value.trim() || null,
    created_by: state.user.id,
  });
  if (error) return showToast(friendlyErrorMessage(error), "error");
  $("marketingProjectDialog").close();
  await loadData();
  showToast("Projeto vinculado ao Controle de Marketing.");
}

function openMarketingJourney(projectId) {
  state.selectedMarketingProjectId = projectId;
  renderMarketingJourney(projectId);
  $("marketingJourneyDialog").showModal();
}

function renderMarketingJourney(projectId) {
  const project = state.marketingProjects.find((item) => item.id === projectId);
  if (!project) return;

  const progress = marketingProgressFor(projectId);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const linkedProject = projectById(project.projeto_id);
  $("marketingJourneyTitle").textContent = linkedProject?.nome || project.municipio;
  $("marketingJourneySubtitle").textContent = linkedProject ? `${linkedProject.cidade}/${linkedProject.estado} • ${projectClientCount(linkedProject.id)} cliente(s) vinculados` : (project.observacoes || "Sem observações registradas.");
  $("marketingJourneyProgress").innerHTML = `
    <div class="marketing-progress-bar"><div class="marketing-progress-fill" style="width:${pct}%"></div></div>
    <strong>${progress.done}/${progress.total} etapas concluídas</strong>`;

  const fases = [...new Map(state.marketingEtapas.map((etapa) => [etapa.fase_numero, etapa.fase_nome])).entries()].sort((a, b) => a[0] - b[0]);

  $("marketingJourneyPhases").innerHTML = fases.map(([faseNumero, faseNome]) => {
    const color = MARKETING_FASE_COLORS[faseNumero] || "var(--primary)";
    const etapas = state.marketingEtapas.filter((etapa) => etapa.fase_numero === faseNumero).sort((a, b) => a.ordem - b.ordem);
    const rows = etapas.map((etapa) => {
      const progressRow = state.marketingProgress.find((row) => row.projeto_id === projectId && row.etapa_id === etapa.id);
      const done = progressRow?.concluida;
      const meta = done
        ? `Concluída por ${escapeHtml(profileName(progressRow.concluida_por))} em ${formatDateTime(progressRow.concluida_em)}`
        : "Pendente";
      return `<div class="marketing-etapa-row">
        <div class="marketing-etapa-info">
          <strong>${escapeHtml(etapa.codigo)} — ${escapeHtml(etapa.titulo)}</strong>
          <span>${escapeHtml(etapa.descricao || "")}</span>
          <span class="marketing-etapa-meta">${meta}</span>
        </div>
        <button type="button" class="${done ? "secondary" : "primary"} small-button marketing-etapa-toggle" data-toggle-marketing-etapa="${progressRow?.id || ""}">${done ? "Reabrir" : "Concluir"}</button>
      </div>`;
    }).join("");
    return `<article class="marketing-phase-section" style="border-left-color:${color}">
      <h3><span class="marketing-phase-number" style="background:${color}">${faseNumero}</span> ${escapeHtml(faseNome)}</h3>
      ${rows}
    </article>`;
  }).join("");
}

async function toggleMarketingEtapa(progressId) {
  const row = state.marketingProgress.find((item) => item.id === progressId);
  if (!row) return;
  const willComplete = !row.concluida;
  const { error } = await supabase.from("marketing_progresso").update({
    concluida: willComplete,
    concluida_em: willComplete ? new Date().toISOString() : null,
    concluida_por: willComplete ? state.user.id : null,
  }).eq("id", progressId);
  if (error) return showToast(friendlyErrorMessage(error), "error");
  await loadData();
  showToast(willComplete ? "Etapa marcada como concluída." : "Etapa reaberta.");
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function setView(view) {
  if (view === "usuarios" && !isAdmin()) view = "dashboard";
  if (view === "marketing" && !isMarketingTeam()) view = "dashboard";
  state.currentView = view;
  document.querySelectorAll(".view").forEach((element) => element.classList.toggle("active", element.id === view));
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));

  const labels = {
    dashboard: ["Visão geral", "Dashboard", "Acompanhe comercial, atendimento e agenda."],
    clientes: ["Base de clientes", "Clientes cadastrados", "Cards organizados automaticamente por município."],
    funil: ["Comercial", "Funil comercial", "Acompanhe as oportunidades por etapa."],
    atendimentos: ["Atendimento", "Atendimentos", "Demandas dos setores Atendimento, Comercial, Financeiro, Projetos, Topografia e Pós-Protocolo, incluindo contatos sincronizados do Chatwoot."],
    tarefas: ["Agenda", "Tarefas", "Controle de prazos e responsabilidades."],
    projetos: ["Estrutura", "Projetos / Núcleos Urbanos", "Cadastre os núcleos e vincule grupos de clientes à mesma cidade e estado."],
    andamentos: ["Pós-venda", "Andamentos", "Atualizações coletivas por Projeto/Núcleo, prontas para consulta pelo agente IA."],
    marketing: ["Pós-venda", "Controle de Marketing", "Jornada do cliente por município nos grupos de WhatsApp."],
    usuarios: ["Administração", "Usuários", "Perfis, acessos e permissões da equipe."],
  };
  const [eyebrow, title, description] = labels[view];
  $("pageEyebrow").textContent = eyebrow;
  $("pageTitle").textContent = title;
  $("pageDescription").textContent = description;
}

// Admin, usuários do Comercial ou quem cadastrou o cliente podem
// atribuir/trocar o Comercial responsável. O seletor continua listando
// somente usuários ativos com perfil Comercial.
function canAssignComercial(existingClient) {
  if (isAdmin()) return true;
  if (state.profile?.perfil === "comercial" || state.profile?.setor === "Comercial") return true;
  if (!existingClient) return true; // cliente novo: quem está criando é o created_by
  return existingClient.created_by === state.user.id;
}

// Mesma regra de canAssignComercial: só Admin ou quem cadastrou o
// cliente pode editar manualmente a lista de Agentes atribuídos.
function canManageAssignedAgents(existingClient) {
  if (isAdmin()) return true;
  if (!existingClient) return true;
  return existingClient.created_by === state.user.id;
}

// Ao registrar um Atendimento, o cliente fica automaticamente
// atribuído a quem registrou + ao Comercial responsável (se houver) —
// além dos agentes já atribuídos antes. Um cliente pode ter vários
// agentes atribuídos (diferente de "Dono do registro", que é único).
async function attributeAgentToClient(clienteId) {
  const client = state.clients.find((item) => item.id === clienteId);
  if (!client) return;
  const assigned = new Set(client.agentes_atribuidos || []);
  const before = assigned.size;
  assigned.add(state.user.id);
  if (client.comercial_id) assigned.add(client.comercial_id);
  if (assigned.size === before) return;
  await supabase.from("clientes").update({ agentes_atribuidos: [...assigned] }).eq("id", clienteId);
}

function openNewClient() {
  $("clientForm").reset();
  $("clientId").value = "";
  $("clientFormTitle").textContent = "Novo cliente";
  $("deleteClientButton").classList.add("hidden");
  $("clientStatus").value = "Novo";
  if ($("clientProject")) $("clientProject").value = "";
  if ($("clientState")) $("clientState").value = "";
  $("clientOwner").value = state.user.id;
  if ($("clientComercial")) {
    $("clientComercial").value = "";
    $("clientComercial").disabled = !canAssignComercial(null);
  }
  if ($("clientAgentsAssigned")) {
    [...$("clientAgentsAssigned").options].forEach((option) => { option.selected = false; });
    $("clientAgentsAssigned").disabled = !canManageAssignedAgents(null);
  }
  $("clientFormDialog").showModal();
}

function openEditClient(client) {
  if (!client) return;
  $("clientId").value = client.id;
  $("clientFormTitle").textContent = "Editar cliente";
  $("clientName").value = client.nome || "";
  $("clientPhone").value = client.telefone || "";
  $("clientEmail").value = client.email || "";
  $("clientProject").value = client.projeto_id || "";
  $("clientState").value = client.estado || clientProject(client)?.estado || "";
  $("clientMunicipality").value = client.municipio || "";
  $("clientNucleus").value = client.nucleo || "";
  $("clientShipment").value = client.remessa || "";
  $("clientSource").value = client.origem || "Indicação";
  $("clientStatus").value = client.status || "Novo";
  $("clientValue").value = client.valor_estimado || 0;
  $("clientOwner").value = client.owner_id;
  if ($("clientComercial")) {
    $("clientComercial").value = client.comercial_id || "";
    $("clientComercial").disabled = !canAssignComercial(client);
  }
  if ($("clientAgentsAssigned")) {
    const assignedIds = new Set(client.agentes_atribuidos || []);
    [...$("clientAgentsAssigned").options].forEach((option) => {
      option.selected = assignedIds.has(option.value);
    });
    $("clientAgentsAssigned").disabled = !canManageAssignedAgents(client);
  }
  $("clientNotes").value = client.observacoes || "";
  $("deleteClientButton").classList.remove("hidden");
  $("clientFormDialog").showModal();
}

async function saveClient(event) {
  event.preventDefault();
  const id = $("clientId").value;
  const existing = state.clients.find((client) => client.id === id);
  const ownerId = isAdmin() ? $("clientOwner").value : (existing?.owner_id || state.user.id);
  const comercialId = canAssignComercial(existing)
    ? ($("clientComercial")?.value || null)
    : (existing?.comercial_id ?? null);
  const agentesAtribuidos = canManageAssignedAgents(existing)
    ? [...($("clientAgentsAssigned")?.selectedOptions || [])].map((option) => option.value)
    : (existing?.agentes_atribuidos ?? []);
  const payload = {
    owner_id: ownerId,
    comercial_id: comercialId,
    agentes_atribuidos: agentesAtribuidos,
    nome: titleCaseName($("clientName").value),
    telefone: $("clientPhone").value.trim() || null,
    telefone_normalizado: $("clientPhone").value.trim() ? normalizeBrazilPhone($("clientPhone").value) : null,
    email: $("clientEmail").value.trim() || null,
    projeto_id: state.projectSchemaReady ? ($("clientProject").value || null) : (existing?.projeto_id || null),
    estado: $("clientState").value.trim().toUpperCase() || null,
    municipio: canonicalCityName($("clientMunicipality").value) || null,
    nucleo: $("clientNucleus").value.trim() || null,
    remessa: $("clientShipment").value.trim() || null,
    origem: $("clientSource").value,
    status: $("clientStatus").value,
    valor_estimado: Number($("clientValue").value || 0),
    codigo_processo: $("clientProcessCode")?.value.trim() || null,
    observacoes: $("clientNotes").value.trim() || null,
  };

  setSync("loading", "Salvando...");
  let result;
  if (existing) {
    result = await supabase.from("clientes").update(payload).eq("id", id).select().single();
  } else {
    result = await supabase.from("clientes").insert({ ...payload, created_by: state.user.id }).select().single();
  }

  if (result.error) {
    setSync("error", "Erro ao salvar");
    return showToast(friendlyErrorMessage(result.error), "error");
  }

  if (existing) {
    const changes = describeClientChanges(existing, payload);
    if (changes.length) {
      await supabase.from("historico").insert({ cliente_id: id, created_by: state.user.id, tipo: "Dados atualizados", descricao: changes.join("\n") });
    }
  } else {
    await supabase.from("historico").insert({ cliente_id: result.data.id, created_by: state.user.id, tipo: "Cliente cadastrado", descricao: `Cadastro criado por ${state.profile.nome}.` });
  }

  $("clientFormDialog").close();
  await loadData();
  showToast(existing ? "Cliente atualizado." : "Cliente cadastrado.");
}

function describeClientChanges(oldClient, payload) {
  const fields = {
    nome: "Nome", telefone: "Telefone", email: "E-mail", projeto_id: "Projeto", estado: "Estado", municipio: "Município", nucleo: "Núcleo", remessa: "Remessa",
    origem: "Origem", status: "Status", valor_estimado: "Valor estimado", codigo_processo: "Código do processo", observacoes: "Observações", owner_id: "Dono do registro", comercial_id: "Comercial", agentes_atribuidos: "Agentes atribuídos",
  };
  return Object.entries(fields).flatMap(([key, label]) => {
    const before = oldClient[key] ?? "";
    const after = payload[key] ?? "";
    const beforeKey = key === "agentes_atribuidos" ? [...(before || [])].sort().join(",") : before;
    const afterKey = key === "agentes_atribuidos" ? [...(after || [])].sort().join(",") : after;
    if (String(beforeKey) === String(afterKey)) return [];
    const format = (value) =>
      key === "valor_estimado" ? money(value) :
      key === "comercial_id" ? (value ? profileName(value) : "Sem comercial atribuído") :
      key === "agentes_atribuidos" ? (Array.isArray(value) && value.length ? value.map(profileName).join(", ") : "Nenhum agente atribuído") :
      key === "owner_id" ? profileName(value) :
      key === "projeto_id" ? projectLabel(projectById(value)) :
      String(value || "Não informado");
    return [`${label}: ${format(before)} → ${format(after)}`];
  });
}

async function deleteClient() {
  const id = $("clientId").value;
  if (!id || !confirm("Excluir este cliente e todo o histórico relacionado?")) return;
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) return showToast(friendlyErrorMessage(error), "error");
  $("clientFormDialog").close();
  $("clientDetailDialog").close();
  state.selectedClientId = null;
  await loadData();
  showToast("Cliente excluído.");
}

function renderClientDetail(clientId) {
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) return;
  state.selectedClientId = clientId;

  $("detailLocation").textContent = client.municipio || "Sem município";
  $("detailName").textContent = clientDisplayName(client);
  const linkedProject = clientProject(client);
  $("detailSubtitle").textContent = linkedProject ? `${linkedProject.nome} • ${linkedProject.cidade}/${linkedProject.estado} • Remessa: ${client.remessa || "-"}` : `Núcleo: ${client.nucleo || "-"} • Remessa: ${client.remessa || "-"}`;
  $("detailStatus").innerHTML = statusBadge(client.status);
  $("detailValue").textContent = money(client.valor_estimado);
  $("detailCreated").textContent = formatDate(client.created_at);
  $("detailLastContact").textContent = formatDate(client.last_contact_at);

  const rows = [
    ["Telefone", client.telefone || "-"], ["E-mail", client.email || "-"], ["Projeto / Núcleo", linkedProject?.nome || client.nucleo || "-"],
    ["Estado", client.estado || linkedProject?.estado || "-"], ["Município", client.municipio || linkedProject?.cidade || "-"],
    ["Núcleo", client.nucleo || "-"], ["Remessa", client.remessa || "-"], ["Origem", client.origem || "-"],
    ["Canal", client.canal || "CRM"], ["Último setor", client.ultimo_setor || "-"], ["Último agente", client.ultimo_agente || "-"],
    ["Dono do registro", profileName(client.owner_id)],
    ["Comercial", client.comercial_id ? profileName(client.comercial_id) : "Sem comercial atribuído"],
    ["Agentes atribuídos", (client.agentes_atribuidos || []).length ? client.agentes_atribuidos.map(profileName).join(", ") : "Nenhum agente atribuído"],
    ["Código do processo", client.codigo_processo || "-"],
    ["CPF", client.cpf || "-"], ["Endereço", client.endereco || "-"], ["Tipo de imóvel", client.tipo_imovel || "-"],
    ["Tipo de posse", client.tipo_posse || "-"], ["Área da posse", client.area_posse || "-"],
    ["Tipo documental", client.tipo_documental || "-"], ["Contrato", client.contrato_status || "-"],
    ["Procuração", client.procuracao_status || "-"], ["Requerimento", client.requerimento_status || "-"], ["Distrato", client.distrato_status || "-"],
    ["Documento faltante", client.documento_faltante || "-"], ["Informação faltante", client.informacao_faltante || "-"],
    ["Situação documental", client.situacao_documental || "-"], ["Observação documental", client.observacao_documental || "-"], ["Observações", client.observacoes || "-"],
  ];
  $("detailData").innerHTML = rows.map(([label, value]) => `<div class="detail-data-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");

  const activity = buildRecentActivity(clientId);
  const creation = { date: client.created_at, title: "Cadastro criado", text: `Responsável inicial: ${profileName(client.owner_id)}`, author: profileName(client.created_by) };
  const timeline = [...activity, creation].sort((a, b) => new Date(b.date) - new Date(a.date));
  $("detailTimeline").innerHTML = timeline.length ? timeline.map((item) => `
    <article class="timeline-item">
      <h4>${escapeHtml(item.title)}</h4>
      <time>${formatDateTime(item.date)} • ${escapeHtml(item.author || "Sistema")}</time>
      <p>${escapeHtml(item.text || "")}</p>
    </article>`).join("") : emptyState("Nenhum histórico registrado.");

  // Só os atendimentos (tickets) registrados por agentes direto no CRM
  // — diferente da Linha do tempo completa acima, que também mistura
  // mensagens sincronizadas do WhatsApp/Chatwoot (kind "interaction").
  const crmTickets = activity.filter((item) => item.kind === "ticket" && item.origem === "CRM").sort((a, b) => new Date(b.date) - new Date(a.date));
  $("detailCrmTickets").innerHTML = crmTickets.length ? crmTickets.map((item) => `
    <article class="timeline-item">
      <h4>${escapeHtml(item.title)}</h4>
      <time>${formatDateTime(item.date)} • ${escapeHtml(item.author || "Sistema")}</time>
      <p>${escapeHtml(item.text || "")}</p>
    </article>`).join("") : emptyState("Nenhum atendimento registrado no CRM ainda.");

  $("taskDueDate").value = today();
  $("taskAssignee").value = client.owner_id || state.user.id;
}


/*
Modelos de planilha reconhecidos na importação:
- "gtb": planilha "Dados Documental GTB" (Requerente, EstadoCivil, Contrato, Procuracao, Requerimento, Distrato...).
- "nui": planilha por Beneficiário/NUI (Agrolândia e similares — Beneficiarios, CodigoNUI, Localizacao, Objeto, Posse, AreaPosse).
*/
const IMPORT_TEMPLATES = {
  gtb: {
    label: "Dados Documental GTB",
    required: ["CodigoProcesso", "Requerente", "Contato"],
    known: ["CodigoProcesso", "Requerente", "Contato", "EstadoCivil", "Tipo", "Contrato", "Procuracao", "Requerimento", "Distrato", "DocumentoFaltante", "InformacaoFaltante", "Observacao", "Situacao"],
  },
  nui: {
    label: "Beneficiários / NUI",
    required: ["CodigoProcesso", "Beneficiarios", "Contato"],
    known: ["CodigoProcesso", "CodigoNUI", "Beneficiarios", "Contato", "Localizacao", "Objeto", "Posse", "AreaPosse", "Situacao"],
  },
};

function detectImportTemplate(headers) {
  if (IMPORT_TEMPLATES.nui.required.every((header) => headers.includes(header))) return "nui";
  if (IMPORT_TEMPLATES.gtb.required.every((header) => headers.includes(header))) return "gtb";
  return null;
}

function cleanImportText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function cleanApplicantName(value) {
  return cleanImportText(value).replace(/;\s*$/, "");
}

// "Daniela Raquel Schmoegel da Silva (CPF 907.755.979-53); Fulano (CPF 000...)"
// -> nomes separados e CPFs separados, na mesma ordem.
function parseBeneficiarios(value) {
  const raw = cleanImportText(value).replace(/;\s*$/, "");
  if (!raw) return { names: [], cpfs: [] };

  const names = [];
  const cpfs = [];

  raw.split(";").map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const match = part.match(/^(.*?)\s*\(\s*CPF[:\s]*([\d.\-\/]+)\s*\)\s*$/i);
    if (match) {
      names.push(match[1].trim());
      cpfs.push(match[2].trim());
    } else {
      names.push(part);
    }
  });

  return { names, cpfs };
}

function extractRowApplicantName(row, template) {
  if (template === "nui") return parseBeneficiarios(row.Beneficiarios).names.join("; ");
  return cleanApplicantName(row.Requerente);
}

function extractImportPhones(value) {
  const raw = String(value || "");
  const matches = raw.match(/(?:\+?55\s*)?\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/g) || [];
  return matches.map((item) => item.replace(/\D/g, "")).filter(Boolean);
}

function projectDataFrom(project) {
  if (!project) return { projeto_id: null, estado: null, municipio: null, nucleo: null };
  return { projeto_id: project.id, estado: project.estado || null, municipio: project.cidade || null, nucleo: project.nome || null };
}

// Prefixo do Código do Processo (parte antes do "_"), ex.: "GTB01" em "GTB01_0386".
function importCodePrefix(codigoProcesso) {
  const code = cleanImportText(codigoProcesso).toUpperCase();
  if (!code) return "";
  return code.split("_")[0].trim();
}

function projectBySigla(prefix) {
  if (!prefix) return null;
  // A sigla não é mais única — projetos diferentes podem compartilhar o mesmo
  // prefixo. Quando houver mais de um, prioriza um projeto ativo para reduzir
  // ambiguidade na importação; se nenhum ativo bater, usa o primeiro que achar.
  const matches = state.projects.filter((project) => (project.sigla || "").trim().toUpperCase() === prefix);
  if (!matches.length) return null;
  return matches.find((project) => project.ativo) || matches[0];
}

function importProjectData() {
  // Projeto/NUI escolhido manualmente no passo 2 — usado como reserva quando
  // o prefixo do Código do Processo da linha não bate com nenhuma sigla cadastrada.
  return projectDataFrom(projectById($("clientImportProject")?.value || ""));
}

// Resolve município/estado/NUI de uma linha: primeiro tenta casar o prefixo do
// Código do Processo com a sigla de um projeto; se não encontrar, usa a reserva.
function resolveImportProjectData(row, fallbackProjectData) {
  const prefix = importCodePrefix(row.CodigoProcesso);
  const matched = projectBySigla(prefix);
  if (matched) return { data: projectDataFrom(matched), matched: true, prefix };
  return { data: fallbackProjectData, matched: false, prefix };
}

function openClientImport() {
  state.importRows = [];
  state.importHeaders = [];
  state.importTemplate = null;
  $("clientImportFile").value = "";
  $("clientImportRun").disabled = true;
  $("clientImportSummary").classList.add("hidden");
  $("clientImportPreview").classList.add("hidden");
  renderOwnerOptions();
  $("clientImportDialog").showModal();
}

async function parseClientImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!window.XLSX) return showToast("Biblioteca de Excel não carregou. Atualize a página e tente novamente.", "error");
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const template = detectImportTemplate(headers);
    if (!template) {
      state.importRows = [];
      state.importTemplate = null;
      $("clientImportRun").disabled = true;
      return showToast(
        `Planilha não reconhecida. Colunas esperadas: "${IMPORT_TEMPLATES.gtb.required.join(", ")}" (modelo ${IMPORT_TEMPLATES.gtb.label}) ou "${IMPORT_TEMPLATES.nui.required.join(", ")}" (modelo ${IMPORT_TEMPLATES.nui.label}).`,
        "error"
      );
    }
    state.importTemplate = template;
    state.importRows = rows.filter((row) => extractRowApplicantName(row, template) || cleanImportText(row.CodigoProcesso));
    state.importHeaders = headers;
    renderClientImportPreview();
  } catch (error) {
    console.error(error);
    showToast(`Não foi possível ler a planilha: ${error.message}`, "error");
  }
}

function renderClientImportPreview() {
  const rows = state.importRows;
  const template = state.importTemplate;
  const templateConfig = IMPORT_TEMPLATES[template] || IMPORT_TEMPLATES.gtb;
  const recognized = templateConfig.known.filter((header) => state.importHeaders.includes(header));
  $("clientImportSummary").innerHTML = `<strong>${rows.length}</strong> linha(s) pronta(s) para validação • modelo detectado: <strong>${escapeHtml(templateConfig.label)}</strong> • ${recognized.length}/${templateConfig.known.length} colunas reconhecidas.`;
  $("clientImportSummary").classList.remove("hidden");
  const sample = rows.slice(0, 12);
  const fallbackProjectData = importProjectData();
  const nameHeader = template === "nui" ? "Beneficiário(s)" : "Requerente";
  $("clientImportPreview").innerHTML = `
    <div class="import-preview-head"><strong>Prévia</strong><span>Mostrando ${sample.length} de ${rows.length}</span></div>
    <div class="import-table-wrap"><table class="import-table">
      <thead><tr><th>Código</th><th>${escapeHtml(nameHeader)}</th><th>Contato</th><th>Município/UF detectado</th><th>Situação</th></tr></thead>
      <tbody>${sample.map((row) => {
        const resolved = resolveImportProjectData(row, fallbackProjectData);
        const location = resolved.data.municipio ? `${resolved.data.municipio}/${resolved.data.estado || "-"}` : (resolved.prefix ? `Prefixo "${resolved.prefix}" sem projeto cadastrado` : "Não identificado");
        return `<tr><td>${escapeHtml(cleanImportText(row.CodigoProcesso))}</td><td>${escapeHtml(extractRowApplicantName(row, template))}</td><td>${escapeHtml(cleanImportText(row.Contato))}</td><td>${escapeHtml(location)}</td><td>${escapeHtml(cleanImportText(row.Situacao))}</td></tr>`;
      }).join("")}</tbody>
    </table></div>`;
  $("clientImportPreview").classList.remove("hidden");
  $("clientImportRun").disabled = rows.length === 0;
}

function importPayloadFromRow(row, projectData, template) {
  const phones = extractImportPhones(row.Contato);
  const primary = phones[0] ? normalizeBrazilPhone(phones[0]) : null;

  const base = {
    owner_id: state.user.id,
    created_by: state.user.id,
    telefone: cleanImportText(row.Contato) || null,
    telefone_normalizado: primary,
    email: null,
    ...projectData,
    remessa: null,
    origem: "Importação Excel",
    status: "Cliente Ativo",
    valor_estimado: 0,
    responsavel: null,
    codigo_processo: cleanImportText(row.CodigoProcesso) || null,
    situacao_documental: cleanImportText(row.Situacao) || null,
  };

  if (template === "nui") {
    const { names, cpfs } = parseBeneficiarios(row.Beneficiarios);
    return {
      ...base,
      nome: names.map(titleCaseName).join("; ") || `Processo ${cleanImportText(row.CodigoProcesso) || "sem código"}`,
      nucleo: cleanImportText(row.CodigoNUI) || base.nucleo || null,
      cpf: cpfs.join("; ") || null,
      endereco: cleanImportText(row.Localizacao) || null,
      tipo_imovel: cleanImportText(row.Objeto) || null,
      tipo_posse: cleanImportText(row.Posse) || null,
      area_posse: cleanImportText(row.AreaPosse) || null,
      observacoes: null,
      importacao_origem: "Beneficiários / NUI",
    };
  }

  const notes = [cleanImportText(row.Observacao), cleanImportText(row.InformacaoFaltante)].filter(Boolean).join("\n");
  return {
    ...base,
    nome: titleCaseName(cleanApplicantName(row.Requerente)) || `Processo ${cleanImportText(row.CodigoProcesso) || "sem código"}`,
    observacoes: notes || null,
    estado_civil: cleanImportText(row.EstadoCivil) || null,
    tipo_documental: cleanImportText(row.Tipo) || null,
    contrato_status: cleanImportText(row.Contrato) || null,
    procuracao_status: cleanImportText(row.Procuracao) || null,
    requerimento_status: cleanImportText(row.Requerimento) || null,
    distrato_status: cleanImportText(row.Distrato) || null,
    documento_faltante: cleanImportText(row.DocumentoFaltante) || null,
    informacao_faltante: cleanImportText(row.InformacaoFaltante) || null,
    observacao_documental: cleanImportText(row.Observacao) || null,
    importacao_origem: "Dados Documental GTB",
  };
}

async function runClientImport() {
  if (!state.importRows.length) return;
  const mode = $("clientImportMode").value;
  const fallbackProjectData = importProjectData();
  const button = $("clientImportRun");
  button.disabled = true;
  setSync("loading", "Importando Excel...");
  let created = 0, updated = 0, skipped = 0, failed = 0, autoLocated = 0;
  const errors = [];
  const unmatchedPrefixes = new Set();

  for (let i = 0; i < state.importRows.length; i += 1) {
    const row = state.importRows[i];
    const resolved = resolveImportProjectData(row, fallbackProjectData);
    if (resolved.matched) autoLocated += 1;
    else if (resolved.prefix && !resolved.data.municipio) unmatchedPrefixes.add(resolved.prefix);
    const payload = importPayloadFromRow(row, resolved.data, state.importTemplate);
    try {
      let existing = null;
      if (payload.codigo_processo) {
        const found = await supabase.from("clientes").select("id,codigo_processo").eq("codigo_processo", payload.codigo_processo).limit(1);
        if (found.error) throw found.error;
        existing = found.data?.[0] || null;
      }
      if (existing) {
        if (mode === "new") { skipped += 1; continue; }
        const updatePayload = { ...payload };
        delete updatePayload.created_by;
        const result = await supabase.from("clientes").update(updatePayload).eq("id", existing.id);
        if (result.error) throw result.error;
        updated += 1;
      } else {
        const result = await supabase.from("clientes").insert(payload);
        if (result.error) throw result.error;
        created += 1;
      }
    } catch (error) {
      failed += 1;
      errors.push(`Linha ${i + 2} (${payload.codigo_processo || payload.nome}): ${friendlyErrorMessage(error)}`);
    }
    if ((i + 1) % 25 === 0 || i === state.importRows.length - 1) {
      setSync("loading", `Importando ${i + 1}/${state.importRows.length}...`);
    }
  }

  const unmatchedNote = unmatchedPrefixes.size
    ? `<p class="muted small-note">Prefixos sem projeto cadastrado (município/estado não preenchidos automaticamente): ${escapeHtml([...unmatchedPrefixes].join(", "))}. Cadastre a sigla em Projetos/NUIs para as próximas importações.</p>`
    : "";
  $("clientImportSummary").innerHTML = `<strong>Importação concluída.</strong> Criados: ${created} • Atualizados: ${updated} • Ignorados: ${skipped} • Erros: ${failed} • Município/UF detectados automaticamente: ${autoLocated}/${state.importRows.length}${errors.length ? `<details><summary>Ver erros</summary><pre>${escapeHtml(errors.slice(0, 50).join("\n"))}</pre></details>` : ""}${unmatchedNote}`;
  await loadData();
  setSync("", "Sincronizado");
  button.disabled = false;
  showToast(`Importação concluída: ${created} novos, ${updated} atualizados${failed ? `, ${failed} com erro` : ""}.`, failed ? "error" : "success");
}

function openClientDetail(clientId) {
  renderClientDetail(clientId);
  $("clientDetailDialog").showModal();
}

async function saveHistory(event) {
  event.preventDefault();
  const { error } = await supabase.from("historico").insert({
    cliente_id: state.selectedClientId,
    created_by: state.user.id,
    tipo: $("historyType").value,
    descricao: $("historyDescription").value.trim(),
  });
  if (error) return showToast(friendlyErrorMessage(error), "error");
  event.target.reset();
  await loadData();
  showToast("Atualização registrada.");
}

async function saveTicket(event) {
  event.preventDefault();
  const clienteId = state.selectedClientId;
  const { error } = await supabase.from("atendimentos").insert({
    cliente_id: clienteId,
    created_by: state.user.id,
    setor: $("ticketSector").value,
    assunto: $("ticketSubject").value.trim(),
    status: $("ticketStatus").value,
    observacao: $("ticketNotes").value.trim() || null,
  });
  if (error) return showToast(friendlyErrorMessage(error), "error");
  await attributeAgentToClient(clienteId);
  event.target.reset();
  await loadData();
  showToast("Atendimento registrado.");
}

async function saveTask(event) {
  event.preventDefault();
  const client = state.clients.find((item) => item.id === state.selectedClientId);
  const assignedTo = isAdmin() ? $("taskAssignee").value : state.user.id;
  const { error } = await supabase.from("tarefas").insert({
    cliente_id: state.selectedClientId,
    created_by: state.user.id,
    assigned_to: assignedTo || client.owner_id,
    titulo: $("taskTitle").value.trim(),
    data: $("taskDueDate").value,
    prioridade: $("taskPriority").value,
  });
  if (error) return showToast(friendlyErrorMessage(error), "error");
  event.target.reset();
  $("taskDueDate").value = today();
  await loadData();
  showToast("Tarefa criada.");
}

async function resolveTicket(id) {
  const { error } = await supabase.from("atendimentos").update({ status: "Resolvido" }).eq("id", id);
  if (error) return showToast(friendlyErrorMessage(error), "error");
  await loadData();
  showToast("Atendimento resolvido.");
}

async function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const { error } = await supabase.from("tarefas").update({ concluida: !task.concluida }).eq("id", id);
  if (error) return showToast(friendlyErrorMessage(error), "error");
  await loadData();
  showToast(task.concluida ? "Tarefa reaberta." : "Tarefa concluída.");
}

async function deleteTicket(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket || !canDeleteOperationalRecord(ticket)) return showToast("Você não tem permissão para excluir este atendimento.", "error");
  if (!window.confirm(`Excluir o atendimento "${ticket.assunto || "Sem assunto"}"?\n\nEle sairá da lista operacional, mas continuará registrado no histórico do usuário.`)) return;
  const { error } = await supabase.from("atendimentos").delete().eq("id", id);
  if (error) return showToast(friendlyErrorMessage(error), "error");
  await recordUserActivity({
    userId: ticket.created_by || state.user.id,
    type: "Atendimento excluído",
    description: `Atendimento removido da lista operacional: ${ticket.assunto || "Sem assunto"} • Setor: ${ticket.setor || "Não informado"}.`,
    entity: "atendimento", entityId: ticket.id, data: ticket,
  });
  await loadData();
  showToast("Atendimento excluído e preservado no histórico do usuário.");
}

async function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || !canDeleteOperationalRecord(task)) return showToast("Você não tem permissão para excluir esta tarefa.", "error");
  if (!window.confirm(`Excluir a tarefa "${task.titulo || "Sem título"}"?\n\nEla sairá da agenda, mas continuará registrada no histórico do usuário.`)) return;
  const { error } = await supabase.from("tarefas").delete().eq("id", id);
  if (error) return showToast(friendlyErrorMessage(error), "error");
  await recordUserActivity({
    userId: task.created_by || state.user.id,
    type: "Tarefa excluída",
    description: `Tarefa removida da lista operacional: ${task.titulo || "Sem título"}${task.data ? ` • Prazo: ${formatDate(task.data)}` : ""}.`,
    entity: "tarefa", entityId: task.id, data: task,
  });
  await loadData();
  showToast("Tarefa excluída e preservada no histórico do usuário.");
}

/* ------------------------------------------------------------------
   Seletor de cliente com busca — usado nos diálogos avulsos de
   atendimento e tarefa (sem precisar abrir a ficha do cliente antes).
------------------------------------------------------------------ */
function setupClientPicker(prefix) {
  const input = $(`${prefix}ClientSearch`);
  const hidden = $(`${prefix}ClientId`);
  const results = $(`${prefix}ClientResults`);

  function close() {
    results.classList.add("hidden");
    results.innerHTML = "";
  }

  function search(term) {
    const query = term.trim().toLowerCase();
    if (!query) return close();
    const matches = state.clients.filter((client) => {
      const haystack = [client.codigo_processo, client.nome, client.municipio, client.nucleo].join(" ").toLowerCase();
      return haystack.includes(query);
    }).slice(0, 8);

    if (!matches.length) {
      results.innerHTML = `<div class="client-picker-empty">Nenhum cliente encontrado.</div>`;
      results.classList.remove("hidden");
      return;
    }

    results.innerHTML = matches.map((client) => `
      <button type="button" class="client-picker-option" data-pick-client="${client.id}">
        <strong>${escapeHtml(clientDisplayName(client))}</strong>
        <span>${escapeHtml(client.municipio || "Sem município")} • ${escapeHtml(client.nucleo || "Sem NUI")}</span>
      </button>`).join("");
    results.classList.remove("hidden");
  }

  input.addEventListener("input", () => {
    hidden.value = "";
    search(input.value);
  });
  input.addEventListener("focus", () => { if (input.value) search(input.value); });

  results.addEventListener("click", (event) => {
    const option = event.target.closest("[data-pick-client]");
    if (!option) return;
    const client = state.clients.find((item) => item.id === option.dataset.pickClient);
    if (!client) return;
    hidden.value = client.id;
    input.value = `${clientDisplayName(client)} — ${client.municipio || "Sem município"} / ${client.nucleo || "Sem NUI"}`;
    close();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(`[data-picker="${prefix}"]`)) close();
  });

  return { reset: () => { input.value = ""; hidden.value = ""; close(); } };
}

function openTicketDialog() {
  $("ticketStandaloneForm").reset();
  $("ticketStandaloneClientId").value = "";
  $("ticketStandaloneClientResults").classList.add("hidden");
  $("ticketStandaloneDialog").showModal();
}

async function saveStandaloneTicket(event) {
  event.preventDefault();
  const clienteId = $("ticketStandaloneClientId").value;
  if (!clienteId) return showToast("Selecione um cliente da lista de sugestões.", "error");

  const { error } = await supabase.from("atendimentos").insert({
    cliente_id: clienteId,
    created_by: state.user.id,
    setor: $("ticketStandaloneSector").value,
    assunto: $("ticketStandaloneSubject").value.trim(),
    status: $("ticketStandaloneStatus").value,
    observacao: $("ticketStandaloneNotes").value.trim() || null,
  });
  if (error) return showToast(friendlyErrorMessage(error), "error");
  await attributeAgentToClient(clienteId);
  $("ticketStandaloneDialog").close();
  await loadData();
  showToast("Atendimento registrado.");
}

function openTaskDialog() {
  $("taskStandaloneForm").reset();
  $("taskStandaloneClientId").value = "";
  $("taskStandaloneClientResults").classList.add("hidden");
  $("taskStandaloneDueDate").value = today();
  $("taskStandaloneDialog").showModal();
}

async function saveStandaloneTask(event) {
  event.preventDefault();
  const clienteId = $("taskStandaloneClientId").value;
  if (!clienteId) return showToast("Selecione um cliente da lista de sugestões.", "error");

  const client = state.clients.find((item) => item.id === clienteId);
  const assignedTo = isAdmin() ? $("taskStandaloneAssignee").value : state.user.id;
  const { error } = await supabase.from("tarefas").insert({
    cliente_id: clienteId,
    created_by: state.user.id,
    assigned_to: assignedTo || client?.owner_id,
    titulo: $("taskStandaloneTitle").value.trim(),
    data: $("taskStandaloneDueDate").value,
    prioridade: $("taskStandalonePriority").value,
  });
  if (error) return showToast(friendlyErrorMessage(error), "error");
  $("taskStandaloneDialog").close();
  await loadData();
  showToast("Tarefa criada.");
}

async function createUser(event) {
  event.preventDefault();
  const message = $("createUserMessage");
  message.className = "form-message";
  const apelido = normalizeNickname($("newUserNickname").value);
  if (!isValidNickname(apelido)) {
    message.textContent = "O nome de usuário deve ter de 3 a 30 caracteres e usar apenas letras minúsculas, números, ponto, hífen ou _.";
    return;
  }
  message.textContent = "Criando usuário...";

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    message.textContent = "Sua sessão expirou. Entre novamente no CRM.";
    return;
  }

  const response = await fetch("/api/admin-user-create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      nome: $("newUserName").value.trim(),
      apelido: normalizeNickname($("newUserNickname").value),
      email: $("newUserEmail").value.trim(),
      password: $("newUserPassword").value,
      perfil: $("newUserRole").value,
      setor: $("newUserSector")?.value || "Atendimento",
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.error) {
    message.textContent = data?.error || "Não foi possível criar o usuário.";
    return;
  }

  message.className = "form-message success";
  message.textContent = "Usuário criado com sucesso.";
  event.target.reset();
  await loadData();
}

function openChangePasswordDialog() {
  $("changePasswordForm").reset();
  $("changePasswordMessage").className = "form-message";
  $("changePasswordMessage").textContent = "";
  $("changePasswordDialog").showModal();
}

async function changeOwnPassword(event) {
  event.preventDefault();
  const message = $("changePasswordMessage");
  message.className = "form-message";

  const pass1 = $("changePasswordNew").value;
  const pass2 = $("changePasswordConfirm").value;

  if (pass1.length < 8) {
    message.textContent = "A senha deve ter pelo menos 8 caracteres.";
    return;
  }
  if (pass1 !== pass2) {
    message.textContent = "As senhas não coincidem.";
    return;
  }

  message.textContent = "Salvando...";
  const { error } = await supabase.auth.updateUser({ password: pass1 });

  if (error) {
    message.textContent = error.message || "Não foi possível alterar a senha.";
    return;
  }

  message.className = "form-message success";
  message.textContent = "Senha alterada com sucesso.";
  event.target.reset();
  showToast("Senha alterada com sucesso.");
  setTimeout(() => $("changePasswordDialog").close(), 900);
}

function openResetPasswordDialog(profile) {
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
}

async function updateUserProfile(id, patch) {
  if (id === state.user.id && patch.ativo === false) return showToast("Você não pode desativar seu próprio usuário.", "error");
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) return showToast(friendlyErrorMessage(error), "error");
  await loadData();
  showToast("Usuário atualizado.");
}

function bindEvents() {
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $("loginMessage");
    message.textContent = "Entrando...";
    const identifier = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    let data;
    let error;

    if (identifier.includes("@")) {
      const result = await supabase.auth.signInWithPassword({ email: identifier, password });
      data = result.data;
      error = result.error;
    } else {
      const result = await supabase.functions.invoke("login-username", {
        body: { username: normalizeNickname(identifier), password },
      });

      if (result.error || result.data?.error) {
        error = result.error || new Error(result.data?.error);
      } else if (result.data?.session?.access_token && result.data?.session?.refresh_token) {
        const sessionResult = await supabase.auth.setSession({
          access_token: result.data.session.access_token,
          refresh_token: result.data.session.refresh_token,
        });
        data = sessionResult.data;
        error = sessionResult.error;
      } else {
        error = new Error("Sessão inválida.");
      }
    }

    if (error || !data?.user) {
      message.textContent = "Usuário/e-mail ou senha inválidos.";
      return;
    }

    message.textContent = "";
    await startAuthenticated(data.user);
  });

  $("logoutButton").addEventListener("click", () => supabase.auth.signOut());
  $("changePasswordButton").addEventListener("click", openChangePasswordDialog);
  $("changePasswordForm").addEventListener("submit", changeOwnPassword);
  $("resetPasswordForm").addEventListener("submit", submitResetPassword);
  $("refreshButton").addEventListener("click", loadData);
  $("newClientButton").addEventListener("click", openNewClient);
  $("importClientsButton").addEventListener("click", openClientImport);
  $("clientImportFile").addEventListener("change", parseClientImportFile);
  $("clientImportProject").addEventListener("change", () => { if (state.importRows.length) renderClientImportPreview(); });
  $("clientImportRun").addEventListener("click", runClientImport);
  $("clientForm").addEventListener("submit", saveClient);
  $("deleteClientButton").addEventListener("click", deleteClient);
  $("historyForm").addEventListener("submit", saveHistory);
  $("ticketForm").addEventListener("submit", saveTicket);
  $("taskForm").addEventListener("submit", saveTask);
  $("createUserForm").addEventListener("submit", createUser);
  $("newProjectButton").addEventListener("click", () => {
    const drill = state.projectsDrill;
    let prefill = null;
    if (drill.municipio) {
      const source = state.projects.find((p) => municipioKeyOf(p) === drill.municipio);
      if (source) prefill = { cidade: source.cidade, estado: source.estado };
    }
    openProjectDialog(null, prefill);
  });
  $("projectForm").addEventListener("submit", saveProject);
  $("newProgressButton").addEventListener("click", () => openProgressDialog(state.progressDrill.projetoId || ""));
  $("progressForm").addEventListener("submit", saveProjectProgress);
  $("clientProject").addEventListener("change", applyProjectToClientForm);
  $("newMarketingProjectButton").addEventListener("click", openMarketingProjectDialog);
  $("marketingProjectForm").addEventListener("submit", saveMarketingProject);
  $("newTicketButton").addEventListener("click", openTicketDialog);
  $("ticketStandaloneForm").addEventListener("submit", saveStandaloneTicket);
  $("newTaskButton").addEventListener("click", openTaskDialog);
  $("taskStandaloneForm").addEventListener("submit", saveStandaloneTask);
  setupClientPicker("ticketStandalone");
  setupClientPicker("taskStandalone");

  $("editDetailClientButton").addEventListener("click", () => {
    const client = state.clients.find((item) => item.id === state.selectedClientId);
    $("clientDetailDialog").close();
    openEditClient(client);
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.closeDialog === "progressDialog") {
      state.editingProgressId = null;
      $("progressProject").disabled = false;
    }
    $(button.dataset.closeDialog).close();
  }));
  document.querySelectorAll(".nav-button").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));

  ["clientSearch", "municipalityFilter", "nucleusFilter", "clientStatusFilter", "clientOwnerFilter"].forEach((id) => $(id).addEventListener(id === "clientSearch" ? "input" : "change", renderClients));
  ["pipelineSearch", "pipelineOwnerFilter", "pipelineComercialFilter"].forEach((id) => $(id).addEventListener(id === "pipelineSearch" ? "input" : "change", renderPipeline));
  ["ticketSearch", "ticketMunicipalityFilter", "ticketNucleusFilter", "ticketAgentFilter", "ticketStatusFilter"].forEach((id) => $(id).addEventListener(id === "ticketSearch" ? "input" : "change", () => { state.ticketsVisible = LIST_PAGE_SIZE; renderTickets(); }));
  ["taskSearch", "taskMunicipalityFilter", "taskNucleusFilter", "taskStateFilter"].forEach((id) => $(id).addEventListener(id === "taskSearch" ? "input" : "change", () => { state.tasksVisible = LIST_PAGE_SIZE; renderTasks(); }));
  ["projectSearch", "projectStateFilter", "projectActiveFilter"].forEach((id) => $(id).addEventListener(id === "projectSearch" ? "input" : "change", renderProjects));
  ["progressSearch", "progressStateFilter", "progressStatusFilter", "progressActivityFilter"].forEach((id) => {
    $(id).addEventListener(id === "progressSearch" ? "input" : "change", renderProjectProgress);
  });
  ["marketingSearch", "marketingStatusFilter"].forEach((id) => $(id).addEventListener(id === "marketingSearch" ? "input" : "change", renderMarketingProjects));
  $("ticketsLoadMore").addEventListener("click", () => { state.ticketsVisible += LIST_PAGE_SIZE; renderTickets(); });
  $("tasksLoadMore").addEventListener("click", () => { state.tasksVisible += LIST_PAGE_SIZE; renderTasks(); });

  document.addEventListener("click", async (event) => {
    const openButton = event.target.closest("[data-open-client]");
    if (openButton) openClientDetail(openButton.dataset.openClient);

    const resolveButton = event.target.closest("[data-resolve-ticket]");
    if (resolveButton) resolveTicket(resolveButton.dataset.resolveTicket);

    const taskButton = event.target.closest("[data-toggle-task]");
    if (taskButton) toggleTask(taskButton.dataset.toggleTask);

    const deleteTicketButton = event.target.closest("[data-delete-ticket]");
    if (deleteTicketButton) deleteTicket(deleteTicketButton.dataset.deleteTicket);

    const deleteTaskButton = event.target.closest("[data-delete-task]");
    if (deleteTaskButton) deleteTask(deleteTaskButton.dataset.deleteTask);

    const editProjectButton = event.target.closest("[data-edit-project]");
    if (editProjectButton) openProjectDialog(projectById(editProjectButton.dataset.editProject));

    const deleteProjectButton = event.target.closest("[data-delete-project]");
    if (deleteProjectButton) await deleteProject(deleteProjectButton.dataset.deleteProject);

    const openProjectProgressButton = event.target.closest("[data-open-project-progress]");
    if (openProjectProgressButton) {
      const project = projectById(openProjectProgressButton.dataset.openProjectProgress);
      if (project) {
        state.progressDrill.municipio = municipioKeyOf(project);
        state.progressDrill.projetoId = project.id;
      }
      setView("andamentos");
      renderProjectProgress();
    }

    const newProjectProgressButton = event.target.closest("[data-new-progress-project]");
    if (newProjectProgressButton) openProgressDialog(newProjectProgressButton.dataset.newProgressProject);

    const editProgressButton = event.target.closest("[data-edit-progress]");
    if (editProgressButton) {
      const item = state.projectProgress.find((row) => row.id === editProgressButton.dataset.editProgress);
      if (item) openProgressDialog(item.projeto_id, item);
    }

    const deleteProgressButton = event.target.closest("[data-delete-progress]");
    if (deleteProgressButton) {
      await deleteProjectProgress(
        deleteProgressButton.dataset.deleteProgress,
        deleteProgressButton.dataset.deleteProgressProject
      );
    }

    // Navegação em três níveis (Município → Projeto → Detalhes) — Projetos
    const projectsCrumb = event.target.closest("[data-projects-crumb]");
    if (projectsCrumb) {
      const action = projectsCrumb.dataset.projectsCrumb;
      if (action === "root") { state.projectsDrill.municipio = null; state.projectsDrill.projetoId = null; }
      else if (action.startsWith("municipio:")) { state.projectsDrill.municipio = action.slice("municipio:".length); state.projectsDrill.projetoId = null; }
      renderProjects();
    }

    const selectMunicipio = event.target.closest("[data-select-municipio]");
    if (selectMunicipio) {
      state.projectsDrill.municipio = selectMunicipio.dataset.selectMunicipio;
      state.projectsDrill.projetoId = null;
      renderProjects();
    }

    const selectProject = event.target.closest("[data-select-project]");
    if (selectProject) {
      state.projectsDrill.projetoId = selectProject.dataset.selectProject;
      renderProjects();
    }

    // Navegação em três níveis (Município → Projeto → Andamentos) — Andamentos
    const progressCrumb = event.target.closest("[data-progress-crumb]");
    if (progressCrumb) {
      const action = progressCrumb.dataset.progressCrumb;
      if (action === "root") { state.progressDrill.municipio = null; state.progressDrill.projetoId = null; }
      else if (action.startsWith("municipio:")) { state.progressDrill.municipio = action.slice("municipio:".length); state.progressDrill.projetoId = null; }
      renderProjectProgress();
    }

    const selectProgressMunicipio = event.target.closest("[data-select-progress-municipio]");
    if (selectProgressMunicipio) {
      state.progressDrill.municipio = selectProgressMunicipio.dataset.selectProgressMunicipio;
      state.progressDrill.projetoId = null;
      renderProjectProgress();
    }

    const selectProgressProject = event.target.closest("[data-select-progress-project]");
    if (selectProgressProject) {
      state.progressDrill.projetoId = selectProgressProject.dataset.selectProgressProject;
      renderProjectProgress();
    }

    const marketingProjectButton = event.target.closest("[data-open-marketing-project]");
    if (marketingProjectButton) openMarketingJourney(marketingProjectButton.dataset.openMarketingProject);

    const marketingEtapaButton = event.target.closest("[data-toggle-marketing-etapa]");
    if (marketingEtapaButton && marketingEtapaButton.dataset.toggleMarketingEtapa) toggleMarketingEtapa(marketingEtapaButton.dataset.toggleMarketingEtapa);

    const editUserButton = event.target.closest("[data-edit-user]");
    if (editUserButton) {
      const profile = state.profiles.find((item) => item.id === editUserButton.dataset.editUser);
      openResetPasswordDialog(profile);
    }
  });

}

bootstrap().catch((error) => {
  console.error(error);
  showOnly("loginScreen");
  $("loginMessage").textContent = `Erro ao iniciar: ${error.message}`;
});
