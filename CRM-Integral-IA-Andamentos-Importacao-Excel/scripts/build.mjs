import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "dist");
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "COLE_AQUI_A_PROJECT_URL";
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "COLE_AQUI_A_PUBLISHABLE_KEY";

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const file of ["style.css", "app.js", "weekly.css", "weekly.js", "weekly-approvals.js"]) {
  await cp(resolve(root, file), resolve(out, file));
}

// A importação em massa deve usar o mesmo Status do card de cliente.
// Mantemos "Cliente Ativo" como padrão para preservar o comportamento anterior,
// mas o usuário pode escolher qualquer etapa do funil antes de importar.
let app = await readFile(resolve(out, "app.js"), "utf8");
const importStatusSource = '    status: "Cliente Ativo",';
const importStatusTarget = '    status: $("clientImportStatus")?.value || "Cliente Ativo",';
if (!app.includes(importStatusSource)) {
  throw new Error("Não foi possível localizar o status padrão da importação em app.js.");
}
app = app.replace(importStatusSource, importStatusTarget);

// O Funil Comercial deve exibir oportunidades com valor informado mesmo quando
// ainda não há um Comercial atribuído. Isso evita esconder propostas reais como
// Contato feito/Proposta enviada. Cadastros operacionais sem valor continuam fora
// do funil enquanto não tiverem Comercial responsável.
const pipelineRuleSource = '    return client.status !== "Cliente Ativo" && clientHasComercial(client) && (!search || haystack.includes(search)) && (!owner || client.owner_id === owner) && (!comercial || clientComercialIds(client).includes(comercial));';
const pipelineRuleTarget = '    return client.status !== "Cliente Ativo" && (clientHasComercial(client) || Number(client.valor_estimado || 0) > 0) && (!search || haystack.includes(search)) && (!owner || client.owner_id === owner) && (!comercial || clientComercialIds(client).includes(comercial));';
if (!app.includes(pipelineRuleSource)) {
  throw new Error("Não foi possível localizar a regra do Funil Comercial em app.js.");
}
app = app.replace(pipelineRuleSource, pipelineRuleTarget);
await writeFile(resolve(out, "app.js"), app, "utf8");

let index = await readFile(resolve(root, "index.html"), "utf8");
const importStatusCard = `
        <article class="panel flat">
          <p class="eyebrow">4. Status</p>
          <h3>Status dos clientes</h3>
          <label>Status aplicado a esta importação
            <select id="clientImportStatus">
              <option>Novo</option>
              <option>Contato feito</option>
              <option>Proposta enviada</option>
              <option>Negociação</option>
              <option selected>Cliente Ativo</option>
              <option>Perdido</option>
            </select>
          </label>
          <p class="muted small-note">O status escolhido será aplicado a todos os clientes desta importação, inclusive aos registros atualizados quando o modo permitir atualização.</p>
        </article>`;
const importGridEnd = `        </article>\n      </div>\n\n      <div id="clientImportSummary"`;
if (!index.includes(importGridEnd)) {
  throw new Error("Não foi possível localizar a grade da importação em index.html.");
}
index = index.replace(importGridEnd, `        </article>${importStatusCard}\n      </div>\n\n      <div id="clientImportSummary"`);
index = index.replace("</head>", '  <link rel="stylesheet" href="./weekly.css">\n</head>');

// Os módulos da Gestão Semanal criam clientes Supabase próprios. Quando eram
// carregados em paralelo com app.js, podiam disputar a sessão persistida enquanto
// o CRM principal ainda executava loadData(), deixando o Dashboard preso em
// "Atualizando...". Agora eles só iniciam depois de o núcleo do CRM informar
// "Sincronizado". Nenhum dado, tabela, permissão ou regra da Gestão Semanal é alterado.
const weeklyLoader = `
  <script type="module">
    (() => {
      let timer = null;
      const loadWeeklyModules = async () => {
        if (window.__crmWeeklyModulesLoaded) {
          if (timer) clearInterval(timer);
          return;
        }

        const shell = document.getElementById("appShell");
        const sync = document.getElementById("syncStatus");
        const coreReady = shell && !shell.classList.contains("hidden") && sync?.textContent?.trim() === "Sincronizado";
        if (!coreReady) return;

        window.__crmWeeklyModulesLoaded = true;
        if (timer) clearInterval(timer);

        try {
          await import("./weekly.js");
          await import("./weekly-approvals.js");
        } catch (error) {
          window.__crmWeeklyModulesLoaded = false;
          console.error("Falha ao iniciar Gestão Semanal:", error);
        }
      };

      window.addEventListener("load", () => {
        loadWeeklyModules();
        timer = setInterval(loadWeeklyModules, 500);
      }, { once: true });
    })();
  </script>`;

index = index.replace("</body>", `${weeklyLoader}\n</body>`);
await writeFile(resolve(out, "index.html"), index, "utf8");

const config = `window.CRM_CONFIG = ${JSON.stringify({
  supabaseUrl: url,
  supabaseAnonKey: key,
}, null, 2)};\n`;
await writeFile(resolve(out, "config.js"), config, "utf8");

if (url.includes("COLE_AQUI") || key.includes("COLE_AQUI")) {
  console.warn("AVISO: variáveis do Supabase não definidas. Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY na Vercel.");
}
