from pathlib import Path

root = Path(__file__).resolve().parents[1]
app_path = root / 'app.js'
index_path = root / 'index.html'
css_path = root / 'style.css'
app = app_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')

# Remove visualmente os campos solicitados, preservando colunas antigas no banco.
index = index.replace('        <label>Responsável operacional<input id="clientResponsible" /></label>\n', '')
index = index.replace('        <label>Estado civil<input id="clientCivilStatus" /></label>\n', '')

# Estado e carga do histórico por usuário.
if 'userHistory: []' not in app:
    app = app.replace('  history: [],\n  interactions: [],', '  history: [],\n  userHistory: [],\n  interactions: [],', 1)
    app = app.replace('    history: [],\n  interactions: [],', '    history: [],\n    userHistory: [],\n    interactions: [],', 1)

app = app.replace(
    'const [profilesResult, clientsResult, ticketsResult, tasksResult, historyResult, interactionsResult, etapasResult, projectsResult, progressResult] = await Promise.all([',
    'const [profilesResult, clientsResult, ticketsResult, tasksResult, historyResult, userHistoryResult, interactionsResult, etapasResult, projectsResult, progressResult] = await Promise.all(['
)
app = app.replace(
    '      supabase.from("historico").select("*").order("created_at", { ascending: false }),\n      supabase.from("interacoes")',
    '      supabase.from("historico").select("*").order("created_at", { ascending: false }),\n      supabase.from("usuario_historico").select("*").order("created_at", { ascending: false }),\n      supabase.from("interacoes")'
)
app = app.replace(
    'const failures = [profilesResult, clientsResult, ticketsResult, tasksResult, historyResult, interactionsResult, etapasResult, projectsResult, progressResult]',
    'const failures = [profilesResult, clientsResult, ticketsResult, tasksResult, historyResult, userHistoryResult, interactionsResult, etapasResult, projectsResult, progressResult]'
)
app = app.replace(
    '    state.history = historyResult.data || [];\n    state.interactions = interactionsResult.data || [];',
    '    state.history = historyResult.data || [];\n    state.userHistory = userHistoryResult.data || [];\n    state.interactions = interactionsResult.data || [];'
)

# Retira referências obrigatórias a elementos que deixaram de existir no card.
app = app.replace('  $("clientResponsible").value = state.profile.nome;\n', '')
app = app.replace('  $("clientResponsible").value = client.responsavel || "";\n', '')
app = app.replace('    responsavel: $("clientResponsible").value.trim() || null,\n', '')
app = app.replace('    estado_civil: $("clientCivilStatus")?.value.trim() || null,\n', '')
app = app.replace(
    '    origem: "Origem", status: "Status", valor_estimado: "Valor estimado", responsavel: "Responsável", codigo_processo: "Código do processo", estado_civil: "Estado civil", observacoes: "Observações", owner_id: "Dono do registro", comercial_id: "Comercial", agentes_atribuidos: "Agentes atribuídos",',
    '    origem: "Origem", status: "Status", valor_estimado: "Valor estimado", codigo_processo: "Código do processo", observacoes: "Observações", owner_id: "Dono do registro", comercial_id: "Comercial", agentes_atribuidos: "Agentes atribuídos",'
)
app = app.replace('    ["Responsável operacional", client.responsavel || "-"], ["Dono do registro", profileName(client.owner_id)],', '    ["Dono do registro", profileName(client.owner_id)],')
app = app.replace('    ["Estado civil", client.estado_civil || "-"], ["Tipo documental", client.tipo_documental || "-"],', '    ["Tipo documental", client.tipo_documental || "-"],')

# Helpers de exclusão e auditoria.
if 'function canDeleteOperationalRecord(record)' not in app:
    marker = 'function renderTickets() {'
    helper = '''function canDeleteOperationalRecord(record) {\n  return isAdmin() || record?.created_by === state.user?.id;\n}\n\nasync function recordUserActivity({ userId, type, description, entity, entityId, data }) {\n  const targetUser = userId || state.user.id;\n  const { error } = await supabase.from("usuario_historico").insert({\n    usuario_id: targetUser,\n    executado_por: state.user.id,\n    tipo: type,\n    descricao: description,\n    entidade: entity,\n    entidade_id: entityId || null,\n    dados: data || null,\n  });\n  if (error) console.warn("Não foi possível registrar histórico do usuário:", error);\n  return !error;\n}\n\n'''
    if marker not in app:
        raise SystemExit('renderTickets não localizado')
    app = app.replace(marker, helper + marker, 1)

# Botões de exclusão.
if 'data-delete-ticket=' not in app:
    before = '${ticket.status !== "Resolvido" ? `<button class="primary small-button" data-resolve-ticket="${ticket.id}">Resolver</button>` : ""}\n      </div>'
    after = '${ticket.status !== "Resolvido" ? `<button class="primary small-button" data-resolve-ticket="${ticket.id}">Resolver</button>` : ""}\n        ${canDeleteOperationalRecord(ticket) ? `<button class="danger small-button" data-delete-ticket="${ticket.id}">Excluir</button>` : ""}\n      </div>'
    if before not in app:
        raise SystemExit('ações de atendimento não localizadas')
    app = app.replace(before, after, 1)

if 'data-delete-task=' not in app:
    before = '<button class="primary small-button" data-toggle-task="${task.id}">${task.concluida ? "Reabrir" : "Concluir"}</button>\n      </div>'
    after = '<button class="primary small-button" data-toggle-task="${task.id}">${task.concluida ? "Reabrir" : "Concluir"}</button>\n        ${canDeleteOperationalRecord(task) ? `<button class="danger small-button" data-delete-task="${task.id}">Excluir</button>` : ""}\n      </div>'
    if before not in app:
        raise SystemExit('ações de tarefa não localizadas')
    app = app.replace(before, after, 1)

# Exclusão preservando cópia completa no histórico do criador.
if 'async function deleteTicket(id)' not in app:
    marker = '''async function toggleTask(id) {\n  const task = state.tasks.find((item) => item.id === id);\n  if (!task) return;\n  const { error } = await supabase.from("tarefas").update({ concluida: !task.concluida }).eq("id", id);\n  if (error) return showToast(friendlyErrorMessage(error), "error");\n  await loadData();\n  showToast(task.concluida ? "Tarefa reaberta." : "Tarefa concluída.");\n}\n'''
    funcs = '''\nasync function deleteTicket(id) {\n  const ticket = state.tickets.find((item) => item.id === id);\n  if (!ticket || !canDeleteOperationalRecord(ticket)) return showToast("Você não tem permissão para excluir este atendimento.", "error");\n  if (!window.confirm(`Excluir o atendimento "${ticket.assunto || "Sem assunto"}"?\\n\\nEle sairá da lista operacional, mas continuará registrado no histórico do usuário.`)) return;\n  const { error } = await supabase.from("atendimentos").delete().eq("id", id);\n  if (error) return showToast(friendlyErrorMessage(error), "error");\n  await recordUserActivity({\n    userId: ticket.created_by || state.user.id,\n    type: "Atendimento excluído",\n    description: `Atendimento removido da lista operacional: ${ticket.assunto || "Sem assunto"} • Setor: ${ticket.setor || "Não informado"}.`,\n    entity: "atendimento", entityId: ticket.id, data: ticket,\n  });\n  await loadData();\n  showToast("Atendimento excluído e preservado no histórico do usuário.");\n}\n\nasync function deleteTask(id) {\n  const task = state.tasks.find((item) => item.id === id);\n  if (!task || !canDeleteOperationalRecord(task)) return showToast("Você não tem permissão para excluir esta tarefa.", "error");\n  if (!window.confirm(`Excluir a tarefa "${task.titulo || "Sem título"}"?\\n\\nEla sairá da agenda, mas continuará registrada no histórico do usuário.`)) return;\n  const { error } = await supabase.from("tarefas").delete().eq("id", id);\n  if (error) return showToast(friendlyErrorMessage(error), "error");\n  await recordUserActivity({\n    userId: task.created_by || state.user.id,\n    type: "Tarefa excluída",\n    description: `Tarefa removida da lista operacional: ${task.titulo || "Sem título"}${task.data ? ` • Prazo: ${formatDate(task.data)}` : ""}.`,\n    entity: "tarefa", entityId: task.id, data: task,\n  });\n  await loadData();\n  showToast("Tarefa excluída e preservada no histórico do usuário.");\n}\n'''
    if marker not in app:
        raise SystemExit('toggleTask não localizado')
    app = app.replace(marker, marker + funcs, 1)

# Card de usuário com histórico recolhível.
start = app.find('function renderUsers() {')
end = app.find('\nfunction marketingProgressFor(', start)
if start < 0 or end < 0:
    raise SystemExit('renderUsers não localizado')
if 'user-admin-card-with-history' not in app[start:end]:
    render = r'''function renderUsers() {
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
'''
    app = app[:start] + render + app[end:]

# Eventos globais dos botões novos.
bind_start = app.find('function bindEvents()')
if bind_start < 0:
    raise SystemExit('bindEvents não localizado')
bind = app[bind_start:]
if 'deleteTicket(deleteTicketButton.dataset.deleteTicket)' not in bind:
    needle = '''    const taskButton = event.target.closest("[data-toggle-task]");\n    if (taskButton) toggleTask(taskButton.dataset.toggleTask);\n'''
    addition = needle + '''\n    const deleteTicketButton = event.target.closest("[data-delete-ticket]");\n    if (deleteTicketButton) deleteTicket(deleteTicketButton.dataset.deleteTicket);\n\n    const deleteTaskButton = event.target.closest("[data-delete-task]");\n    if (deleteTaskButton) deleteTask(deleteTaskButton.dataset.deleteTask);\n'''
    if needle not in app:
        raise SystemExit('evento toggleTask não localizado')
    app = app.replace(needle, addition, 1)

# Estilo do histórico no card do usuário.
if 'Histórico operacional dentro dos cards de usuário' not in css:
    css += '''\n\n/* Histórico operacional dentro dos cards de usuário */\n.user-admin-card-with-history{display:block;width:100%;text-align:left;cursor:default}\n.user-card-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}\n.user-activity-history{margin-top:12px;border-top:1px solid var(--border);padding-top:10px}\n.user-activity-history>summary{cursor:pointer;font-size:12px;font-weight:650;color:var(--text);list-style:none;display:flex;align-items:center;justify-content:space-between}\n.user-activity-history>summary::-webkit-details-marker{display:none}\n.user-activity-history>summary::after{content:'+';font-size:16px;color:var(--muted)}\n.user-activity-history[open]>summary::after{content:'−'}\n.user-activity-list{display:grid;gap:7px;margin-top:10px;max-height:320px;overflow:auto;padding-right:3px}\n.user-activity-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start;padding:9px 10px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2)}\n.user-activity-item div{display:grid;gap:3px;min-width:0}\n.user-activity-item strong{font-size:11.5px}\n.user-activity-item span,.user-activity-item time{font-size:10.5px;color:var(--muted);line-height:1.4}\n.user-activity-item time{white-space:nowrap}\n.record-actions .danger{white-space:nowrap}\n@media(max-width:760px){.user-activity-item{grid-template-columns:1fr}.user-card-head-actions{justify-content:flex-start}}\n'''

app_path.write_text(app, encoding='utf-8')
index_path.write_text(index, encoding='utf-8')
css_path.write_text(css, encoding='utf-8')
print('Patch CRM concluído.')
