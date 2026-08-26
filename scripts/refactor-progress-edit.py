from pathlib import Path

p = Path('CRM-Integral-IA-Andamentos-Importacao-Excel/app.js')
s = p.read_text()

s = s.replace(
    'progressDrill: { municipio: null, projetoId: null },\n  currentView:',
    'progressDrill: { municipio: null, projetoId: null },\n  editingProgressId: null,\n  currentView:'
)

start = s.index('function openProgressDialog(projectId = "") {')
end = s.index('\nfunction applyProjectToClientForm()', start)
new_block = '''function openProgressDialog(projectId = "", progressItem = null) {
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
'''
s = s[:start] + new_block + s[end:]

old_actions = '''<div class="timeline-actions">
              <button class="danger-text-button" type="button"
                data-delete-progress="${item.id}"
                data-delete-progress-project="${project.id}">
                Excluir andamento
              </button>
            </div>'''
new_actions = '''<div class="timeline-actions">
              <button class="secondary small-button" type="button" data-edit-progress="${item.id}">Editar andamento</button>
              <button class="danger-text-button" type="button"
                data-delete-progress="${item.id}"
                data-delete-progress-project="${project.id}">
                Excluir andamento
              </button>
            </div>'''
assert old_actions in s
s = s.replace(old_actions, new_actions, 1)

anchor = '''    const deleteProgressButton = event.target.closest("[data-delete-progress]");
    if (deleteProgressButton) {
      await deleteProjectProgress(
        deleteProgressButton.dataset.deleteProgress,
        deleteProgressButton.dataset.deleteProgressProject
      );
    }
'''
replacement = '''    const editProgressButton = event.target.closest("[data-edit-progress]");
    if (editProgressButton) {
      const item = state.projectProgress.find((row) => row.id === editProgressButton.dataset.editProgress);
      if (item) openProgressDialog(item.projeto_id, item);
    }

''' + anchor
assert anchor in s
s = s.replace(anchor, replacement, 1)

old_close = 'document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $(button.dataset.closeDialog).close()));'
new_close = '''document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.closeDialog === "progressDialog") {
      state.editingProgressId = null;
      $("progressProject").disabled = false;
    }
    $(button.dataset.closeDialog).close();
  }));'''
assert old_close in s
s = s.replace(old_close, new_close, 1)

p.write_text(s)
