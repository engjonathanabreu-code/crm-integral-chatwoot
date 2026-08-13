function json(res, status, body) {
  res.status(status).json(body);
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function headers(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function sb(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados."
    );
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: headers(key),
  });

  const text = await response.text();

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${text}`);
  }

  return data;
}

async function locateClient({
  phone,
  chatwoot_contact_id,
  conversation_id,
}) {
  /*
   * 1. Prioridade: conversa do Chatwoot
   */
  if (conversation_id) {
    const rows = await sb(
      `clientes?chatwoot_last_conversation_id=eq.${encodeURIComponent(
        conversation_id
      )}&select=id,nome,telefone,telefone_normalizado,municipio,nucleo,remessa,projeto_id,estado,chatwoot_contact_id,chatwoot_last_conversation_id&limit=1`
    );

    if (rows.length) {
      return rows[0];
    }
  }

  /*
   * 2. Contact ID do Chatwoot
   */
  if (chatwoot_contact_id) {
    const rows = await sb(
      `clientes?chatwoot_contact_id=eq.${encodeURIComponent(
        chatwoot_contact_id
      )}&select=id,nome,telefone,telefone_normalizado,municipio,nucleo,remessa,projeto_id,estado,chatwoot_contact_id,chatwoot_last_conversation_id&limit=1`
    );

    if (rows.length) {
      return rows[0];
    }
  }

  /*
   * 3. Telefone
   */
  const normalized = normalizePhone(phone);

  if (normalized) {
    const rows = await sb(
      `clientes?telefone_normalizado=eq.${encodeURIComponent(
        normalized
      )}&select=id,nome,telefone,telefone_normalizado,municipio,nucleo,remessa,projeto_id,estado,chatwoot_contact_id,chatwoot_last_conversation_id&limit=1`
    );

    if (rows.length) {
      return rows[0];
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return json(res, 405, {
      ok: false,
      error: "Method not allowed",
    });
  }

  const expected = process.env.CRM_AGENT_READ_SECRET;
  const received = req.headers.authorization || "";

  if (!expected || received !== `Bearer ${expected}`) {
    return json(res, 401, {
      ok: false,
      error: "Não autorizado",
    });
  }

  try {
    const input =
      req.method === "POST"
        ? req.body || {}
        : req.query || {};

    console.log("ANDAMENTO REQUEST:", {
      hasPhone: Boolean(input.phone),
      chatwootContactId:
        input.chatwoot_contact_id || null,
      conversationId:
        input.conversation_id || null,
    });

    const cliente = await locateClient(input);

    if (!cliente) {
      return json(res, 200, {
        ok: true,
        found: false,
        code: "CLIENTE_NAO_LOCALIZADO",
        message:
          "Cliente não localizado no CRM pelos identificadores informados.",
      });
    }

    if (!cliente.projeto_id) {
      return json(res, 200, {
        ok: true,
        found: true,

        cliente: {
          id: cliente.id,
          nome: cliente.nome,
          municipio: cliente.municipio,
          estado: cliente.estado,
          nucleo: cliente.nucleo,
          remessa: cliente.remessa,
        },

        andamento_available: false,

        code: "PROJETO_NAO_VINCULADO",

        message:
          "Cliente localizado, mas ainda não está vinculado a um Projeto/Núcleo no CRM.",
      });
    }

    /*
     * Busca Projeto/NUI
     */
    const projetos = await sb(
      `projetos?id=eq.${cliente.projeto_id}&select=id,nome,cidade,estado,ativo&limit=1`
    );

    const projeto = projetos[0] || null;

    /*
     * Busca somente andamentos permitidos para IA
     */
    const rows = await sb(
      `andamentos?projeto_id=eq.${cliente.projeto_id}` +
        `&visivel_ia=eq.true` +
        `&select=id,status,status_operacional,descricao_cliente,orientacao_ia,previsao,data_atualizacao,created_at` +
        `&order=data_atualizacao.desc,created_at.desc` +
        `&limit=5`
    );

    const atual = rows[0] || null;

    const response = {
      ok: true,
      found: true,

      andamento_available: Boolean(atual),

      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        municipio: cliente.municipio,
        estado: cliente.estado,
        nucleo: cliente.nucleo,
        remessa: cliente.remessa,
      },

      projeto: projeto
        ? {
            id: projeto.id,
            nome: projeto.nome,
            cidade: projeto.cidade,
            estado: projeto.estado,
          }
        : null,

      andamento_atual: atual
        ? {
            etapa: atual.status,
            status_operacional:
              atual.status_operacional,

            descricao_cliente:
              atual.descricao_cliente,

            orientacao_ia:
              atual.orientacao_ia,

            previsao:
              atual.previsao,

            atualizado_em:
              atual.data_atualizacao ||
              atual.created_at,
          }
        : null,

      historico_publico: rows.map((row) => ({
        etapa: row.status,

        status_operacional:
          row.status_operacional,

        descricao_cliente:
          row.descricao_cliente,

        previsao:
          row.previsao,

        atualizado_em:
          row.data_atualizacao ||
          row.created_at,
      })),

      regras_resposta: {
        usar_apenas_dados_retornados: true,
        nunca_expor_observacao_interna: true,
        nunca_inventar_prazo: true,
        previsao_so_quando_preenchida: true,
      },
    };

    console.log("ANDAMENTO SUCCESS:", {
      clienteId: cliente.id,
      projetoId: cliente.projeto_id,
      andamentoAvailable: Boolean(atual),
    });

    return json(res, 200, response);
  } catch (error) {
    console.error(
      "CRM andamento cliente:",
      error
    );

    return json(res, 500, {
      ok: false,
      error: error.message,
    });
  }
}
