function json(res, status, body) {
  res.status(status).json(body);
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function asBool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function supabaseHeaders(serviceRole) {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function sb(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { ...supabaseHeaders(key), ...(options.headers || {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  return data;
}

function getConversation(payload) {
  return payload?.conversation || (String(payload?.event || "").startsWith("conversation_") ? payload : {}) || {};
}

function customAttrs(payload) {
  return getConversation(payload)?.custom_attributes || payload?.custom_attributes || {};
}

function extractPhone(payload) {
  const c = getConversation(payload);
  const sender = payload?.sender || {};
  const contact = c?.meta?.sender || c?.contact || {};
  return sender.phone_number || contact.phone_number || contact.phone || payload?.phone_number || "";
}

function extractName(payload) {
  const attrs = customAttrs(payload);
  const c = getConversation(payload);
  return attrs.ia_nome || payload?.sender?.name || c?.meta?.sender?.name || c?.contact?.name || "Contato WhatsApp";
}

function extractCity(payload) {
  return customAttrs(payload).ia_cidade || null;
}

function extractSector(payload) {
  return customAttrs(payload).ia_setor || getConversation(payload)?.meta?.team?.name || null;
}

function extractAgent(payload) {
  const c = getConversation(payload);
  return c?.meta?.assignee?.name || payload?.sender?.name || null;
}

function authorType(payload) {
  if (payload?.message_type === "incoming" || payload?.message_type === 0 || payload?.message_type === "0") return "Cliente";
  if (asBool(payload?.content_attributes?.integral_ai)) return "IA";
  if (payload?.sender_type === "User" || payload?.message_type === "outgoing" || payload?.message_type === 1 || payload?.message_type === "1") return "Agente";
  return "Sistema";
}

function direction(payload) {
  if (payload?.message_type === "incoming" || payload?.message_type === 0 || payload?.message_type === "0") return "entrada";
  if (payload?.message_type === "outgoing" || payload?.message_type === 1 || payload?.message_type === "1") return "saida";
  return "sistema";
}

async function findOrCreateClient(payload) {
  const phone = normalizePhone(extractPhone(payload));
  const ownerId = process.env.CRM_INTEGRATION_OWNER_ID;
  if (!ownerId) throw new Error("CRM_INTEGRATION_OWNER_ID não configurado.");

  let existing = [];
  if (phone) {
    existing = await sb(`clientes?telefone_normalizado=eq.${encodeURIComponent(phone)}&limit=1`);
  }
  const attrs = customAttrs(payload);
  const conversationId = getConversation(payload)?.id || payload?.conversation?.id || null;
  const contactId = payload?.sender?.id || getConversation(payload)?.meta?.sender?.id || null;
  const patch = {
    nome: extractName(payload),
    telefone: extractPhone(payload) || null,
    telefone_normalizado: phone || null,
    municipio: extractCity(payload),
    origem: "WhatsApp",
    canal: "WhatsApp",
    chatwoot_contact_id: contactId,
    chatwoot_last_conversation_id: conversationId,
    ultimo_setor: extractSector(payload),
    ultimo_agente: extractAgent(payload),
    last_contact_at: new Date().toISOString(),
  };

  if (existing.length) {
    const id = existing[0].id;
    const data = await sb(`clientes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    return data?.[0] || { ...existing[0], ...patch };
  }

  const created = await sb("clientes", {
    method: "POST",
    body: JSON.stringify({
      ...patch,
      owner_id: ownerId,
      created_by: ownerId,
      status: "Contato feito",
      valor_estimado: 0,
    }),
  });
  return created[0];
}

async function ensureAttendance(cliente, payload) {
  const conversationId = getConversation(payload)?.id || payload?.conversation?.id || null;
  if (!conversationId) return null;
  const existing = await sb(`atendimentos?chatwoot_conversation_id=eq.${conversationId}&limit=1`);
  if (existing.length) return existing[0];

  const attrs = customAttrs(payload);
  const sector = extractSector(payload) || "Atendimento";
  const reason = attrs.ia_motivo_contato || "Atendimento via WhatsApp";
  const created = await sb("atendimentos", {
    method: "POST",
    body: JSON.stringify({
      cliente_id: cliente.id,
      created_by: null,
      setor: sector,
      assunto: reason,
      motivo_contato: reason,
      status: "Em andamento",
      origem: "Chatwoot",
      agente_nome: extractAgent(payload),
      chatwoot_conversation_id: conversationId,
    }),
  });
  return created[0];
}

async function saveMessage(cliente, atendimento, payload) {
  if (payload?.event !== "message_created") return;
  const messageId = payload?.id;
  if (messageId) {
    const existing = await sb(`interacoes?chatwoot_message_id=eq.${messageId}&limit=1`);
    if (existing.length) return;
  }
  const type = authorType(payload);
  const createdAt = payload?.created_at ? new Date(Number(payload.created_at) * 1000).toISOString() : new Date().toISOString();
  await sb("interacoes", {
    method: "POST",
    body: JSON.stringify({
      cliente_id: cliente.id,
      atendimento_id: atendimento?.id || null,
      chatwoot_conversation_id: getConversation(payload)?.id || payload?.conversation?.id || null,
      chatwoot_message_id: messageId || null,
      direcao: direction(payload),
      autor_tipo: type,
      autor_nome: type === "Cliente" ? extractName(payload) : (type === "IA" ? "IA Integral" : extractAgent(payload)),
      setor: extractSector(payload),
      conteudo: payload?.content || "",
      tipo_midia: Array.isArray(payload?.attachments) && payload.attachments.length ? (payload.attachments[0]?.file_type || "anexo") : "texto",
      evento: "mensagem",
      metadata: { attachments: payload?.attachments || [] },
      created_at: createdAt,
    }),
  });
}

async function resolveAttendance(payload) {
  const status = String(payload?.status || payload?.conversation?.status || "").toLowerCase();
  if (payload?.event !== "conversation_status_changed" || status !== "resolved") return;
  const conversationId = payload?.conversation?.id || payload?.id;
  if (!conversationId) return;
  await sb(`atendimentos?chatwoot_conversation_id=eq.${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "Resolvido", resolvido_em: new Date().toISOString() }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  const expected = process.env.CRM_CHATWOOT_SYNC_SECRET;
  const received = req.headers.authorization || "";
  if (!expected || received !== `Bearer ${expected}`) return json(res, 401, { ok: false, error: "Não autorizado" });
  try {
    const payload = req.body || {};
    await resolveAttendance(payload);
    const cliente = await findOrCreateClient(payload);
    const atendimento = await ensureAttendance(cliente, payload);
    await saveMessage(cliente, atendimento, payload);
    return json(res, 200, { ok: true, cliente_id: cliente.id, atendimento_id: atendimento?.id || null });
  } catch (error) {
    console.error("CRM Chatwoot Sync:", error);
    return json(res, 500, { ok: false, error: error.message });
  }
}
