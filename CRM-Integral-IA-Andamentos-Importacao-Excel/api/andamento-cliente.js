import crypto from "crypto";

function json(res, status, body) {
  res.status(status).json(body);
}

function headers(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function safeSecretEquals(expected, received) {
  const a = Buffer.from(String(expected || ""));
  const b = Buffer.from(String(received || ""));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function validConversationId(value) {
  const text = String(value || "").trim();
  return /^\d{1,20}$/.test(text) ? text : null;
}

async function sb(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.");
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

/*
 * Endpoint de uso exclusivo do Agente IA.
 * Por segurança ele aceita SOMENTE o ID da conversa atual do Chatwoot.
 * Não permite busca por telefone, nome, contact_id ou outros identificadores
 * fornecidos pelo texto do cliente.
 */
async function locateClientByConversation(conversationId) {
  const rows = await sb(
    `clientes?chatwoot_last_conversation_id=eq.${encodeURIComponent(conversationId)}` +
      `&select=nome,projeto_id` +
      `&limit=1`
  );

  return rows[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      error: "Method not allowed",
    });
  }

  const expected = process.env.CRM_AGENT_READ_SECRET;
  const receivedHeader = String(req.headers.authorization || "");
  const received = receivedHeader.startsWith("Bearer ")
    ? receivedHeader.slice(7)
    : "";

  if (!expected || !safeSecretEquals(expected, received)) {
    return json(res, 401, {
      ok: false,
      error: "Não autorizado",
    });
  }

  try {
    const input = req.body || {};
    const conversationId = validConversationId(input.conversation_id);

    if (!conversationId) {
      return json(res, 400, {
        ok: false,
        code: "INVALID_CONVERSATION_ID",
        error: "conversation_id inválido.",
      });
    }

    console.log("ANDAMENTO REQUEST:", {
      conversationId,
    });

    const cliente = await locateClientByConversation(conversationId);

    if (!cliente) {
      return json(res, 200, {
        ok: true,
        found: false,
        code: "CLIENTE_NAO_LOCALIZADO",
        message: "Cliente não localizado para a conversa atual.",
      });
    }

    if (!cliente.projeto_id) {
      return json(res, 200, {
        ok: true,
        found: true,
        cliente: {
          nome: cliente.nome,
        },
        andamento_available: false,
        code: "PROJETO_NAO_VINCULADO",
        message: "Cliente localizado, mas ainda não está vinculado a um Projeto/Núcleo no CRM.",
      });
    }

    const projetos = await sb(
      `projetos?id=eq.${encodeURIComponent(cliente.projeto_id)}` +
        `&select=nome` +
        `&limit=1`
    );

    const projeto = projetos[0] || null;

    /*
     * Retorna somente campos explicitamente liberados para resposta ao cliente.
     * Observações internas, IDs, contatos, cadastros e histórico completo nunca
     * deixam o CRM por este endpoint.
     */
    const rows = await sb(
      `andamentos?projeto_id=eq.${encodeURIComponent(cliente.projeto_id)}` +
        `&visivel_ia=eq.true` +
        `&select=status,status_operacional,descricao_cliente,orientacao_ia,previsao,data_atualizacao,created_at` +
        `&order=data_atualizacao.desc,created_at.desc` +
        `&limit=1`
    );

    const atual = rows[0] || null;

    const response = {
      ok: true,
      found: true,
      andamento_available: Boolean(atual),

      cliente: {
        nome: cliente.nome,
      },

      projeto: projeto
        ? {
            nome: projeto.nome,
          }
        : null,

      andamento_atual: atual
        ? {
            etapa: atual.status,
            status_operacional: atual.status_operacional,
            descricao_cliente: atual.descricao_cliente,
            orientacao_ia: atual.orientacao_ia,
            previsao: atual.previsao,
            atualizado_em: atual.data_atualizacao || atual.created_at,
          }
        : null,

      regras_resposta: {
        escopo: "somente_conversa_atual",
        usar_apenas_dados_liberados: true,
        nunca_expor_dados_de_terceiros: true,
        nunca_expor_observacao_interna: true,
        nunca_expor_historico_chatwoot: true,
        nunca_expor_credenciais: true,
        nunca_inventar_prazo: true,
        previsao_so_quando_preenchida: true,
      },
    };

    console.log("ANDAMENTO SUCCESS:", {
      conversationId,
      andamentoAvailable: Boolean(atual),
    });

    return json(res, 200, response);
  } catch (error) {
    console.error("CRM andamento cliente:", error);

    return json(res, 500, {
      ok: false,
      error: "Falha ao consultar andamento.",
    });
  }
}
