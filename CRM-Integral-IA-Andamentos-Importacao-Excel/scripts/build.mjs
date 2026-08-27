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

let index = await readFile(resolve(root, "index.html"), "utf8");
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
