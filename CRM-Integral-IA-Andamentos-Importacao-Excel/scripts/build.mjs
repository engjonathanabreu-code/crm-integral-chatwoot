import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "dist");
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "COLE_AQUI_A_PROJECT_URL";
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "COLE_AQUI_A_PUBLISHABLE_KEY";

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const file of ["style.css", "app.js", "weekly.css", "weekly.js"]) {
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
index = index.replace("</body>", '  <script type="module" src="./weekly.js"></script>\n</body>');
await writeFile(resolve(out, "index.html"), index, "utf8");

const config = `window.CRM_CONFIG = ${JSON.stringify({
  supabaseUrl: url,
  supabaseAnonKey: key,
}, null, 2)};\n`;
await writeFile(resolve(out, "config.js"), config, "utf8");

if (url.includes("COLE_AQUI") || key.includes("COLE_AQUI")) {
  console.warn("AVISO: variáveis do Supabase não definidas. Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY na Vercel.");
}
