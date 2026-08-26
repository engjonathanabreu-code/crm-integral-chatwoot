import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "dist");
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "COLE_AQUI_A_PROJECT_URL";
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "COLE_AQUI_A_PUBLISHABLE_KEY";

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const file of ["index.html", "style.css", "app.js", "users-admin.js"]) {
  await cp(resolve(root, file), resolve(out, file));
}

const config = `window.CRM_CONFIG = ${JSON.stringify({
  supabaseUrl: url,
  supabaseAnonKey: key,
}, null, 2)};\n\nimport("./users-admin.js");\n`;
await writeFile(resolve(out, "config.js"), config, "utf8");

if (url.includes("COLE_AQUI") || key.includes("COLE_AQUI")) {
  console.warn("AVISO: variáveis do Supabase não definidas. Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY na Vercel.");
}
