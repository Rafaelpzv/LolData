// Verificação visual real (§10): abre a página no Chrome headless, clica em cada aba e extrai o texto
// renderizado. Usa o protocolo DevTools (CDP) com o WebSocket nativo do Node 24 — nada a instalar.
// Uso: node scripts/visual-check.mjs <porta> <slug>
import { spawn } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

const port = process.argv[2] ?? "3000";
const slug = process.argv[3] ?? "premade-flex";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// ---- o cookie de edição, assinado como o app faz ----
const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const at = line.indexOf("=");
  if (at <= 0 || line.trim().startsWith("#")) continue;
  let v = line.slice(at + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[line.slice(0, at).trim()] = v;
}
const sbUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;
const secret = env.PREMADE_SESSION_SECRET ?? sbKey;
const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };

const [team] = await (
  await fetch(
    `${sbUrl}/rest/v1/premade_teams?slug=eq.${encodeURIComponent(slug)}&select=id,password_version`,
    { headers },
  )
).json();
if (!team) throw new Error(`time ${slug} não encontrado`);

const payload = Buffer.from(
  JSON.stringify({ t: team.id, v: team.password_version ?? 0, e: Date.now() + 3_600_000 }),
).toString("base64url");
const mac = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
const cookieValue = `${payload}.${mac}`;
const cookieName = `premade_edit_${team.id}`;

// ---- o Chrome, com uma porta de depuração própria ----
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lolve-"));
const debugPort = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera o endpoint de depuração responder e devolve a URL do WebSocket. */
async function wsUrl() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // ainda subindo
    }
    await sleep(250);
  }
  throw new Error("Chrome não respondeu no endpoint de depuração");
}

const socket = new WebSocket(await wsUrl());
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let nextId = 1;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) {
    waiter.reject(new Error(JSON.stringify(message.error)));
  } else {
    waiter.resolve(message.result);
  }
};

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

/** Avalia uma expressão na página e devolve o valor já desembrulhado. */
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "erro na página");
  }
  return result.result.value;
}

await send("Network.enable");
await send("Page.enable");
await send("Runtime.enable");
// Coleta erros e avisos do console do navegador. Foi por aqui que o bug da chave duplicada apareceu
// para quem usa a página e não para os testes: só o React, em execução, vê duas children com a mesma key.
const consoleProblems = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (
    message.method === "Runtime.consoleAPICalled" &&
    ["error", "warning"].includes(message.params.type)
  ) {
    const text = message.params.args
      .map((arg) => arg.value ?? arg.description ?? "")
      .join(" ");
    if (text.trim()) {
      consoleProblems.push(`[${message.params.type}] ${text}`.slice(0, 400));
    }
  }
  if (
    message.method === "Log.entryAdded" &&
    ["error", "warning"].includes(message.params.entry.level)
  ) {
    consoleProblems.push(
      `[${message.params.entry.level}] ${message.params.entry.text}`.slice(0, 400),
    );
  }
});
await send("Log.enable");
if (!process.env.NO_COOKIE) await send("Network.setCookie", {
  name: cookieName,
  value: cookieValue,
  domain: "127.0.0.1",
  path: "/",
});

if (process.env.LOCALE) {
  await send("Network.setCookie", { name: "NEXT_LOCALE", value: process.env.LOCALE, domain: "127.0.0.1", path: "/" });
}
await send("Page.navigate", { url: process.env.URL ?? `http://127.0.0.1:${port}/premade/${slug}` });
globalThis.__extra = process.env.PROBE_HTML === "1";
// Espera a hidratação: o cartão do diagnóstico rápido só existe depois dela.
for (let attempt = 0; attempt < 80; attempt += 1) {
  const ready = await evaluate(
    `!!document.body && document.body.innerText.length > 500`,
  );
  if (ready) break;
  await sleep(250);
}

const TABS = [
  ["Visão geral", "overview"],
  ["Individual", "individual"],
  ["Coletiva", "collective"],
  ["Treinamento", "training"],
  ["Padrões", "patterns"],
  ["Evolução", "evolution"],
  ["Partidas", "matches"],
];

const results = [];
for (const [label] of TABS) {
  // Clica na aba pelo texto exato do botão.
  const clicked = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button,[role="tab"],a')];
    const hit = buttons.find((el) => el.textContent.trim() === ${JSON.stringify(label)});
    if (!hit) return false;
    hit.click();
    return true;
  })()`);
  await sleep(700);
  const text = await evaluate(
    `(() => { const m = document.querySelector('main') || document.body; return m.innerText.slice(0, 6000); })()`,
  );
  results.push({ label, clicked, text });
}

// ---- os sinais que provam cada seção ----
const CHECKS = {
  "Visão geral": [],
  "Individual": [],
  "Coletiva": [
    "Linha do tempo da partida",
    "Partida inteira",
    "Todos os jogadores",
    "Abates do grupo",
    "Objetivos",
  ],
  "Treinamento": [],
};

let failures = 0;
for (const { label, clicked, text } of results) {
  console.log(`\n===== aba ${label} (clique: ${clicked ? "ok" : "NÃO ENCONTRADO"}) =====`);
  if (!clicked) failures += 1;
  for (const needle of CHECKS[label] ?? []) {
    const found = text.toLowerCase().includes(needle.toLowerCase());
    console.log(`  ${found ? "OK" : "--"} ${needle}`);
    if (!found) failures += 1;
  }
  if (process.env.PROBE_HTML === "1") {
    const around = await evaluate(`(() => { const t=document.querySelector("main").innerText; const i=t.indexOf("Mortes baixa"); return i<0?"none":t.slice(i-120,i+120); })()`);
    console.log("  AROUND:", around.replace(/\\s+/g," | "));
    const html = await evaluate(`(() => { const els=[...document.querySelectorAll("h4,h3,span,p")].filter(e=>e.textContent.trim()==="Mortes"); return els.map(e=>e.outerHTML.slice(0,300)).join(" ||| "); })()`);
    console.log("  HTML:", html);
  }
  // Qualquer ocorrência de uma chave de tradução crua é bug de locale, não conteúdo.
  const rawKeys = [...text.matchAll(/\bpremade\.[a-zA-Z0-9_.]+\b/g)].map((m) => m[0]);
  const uniq = [...new Set(rawKeys)];
  console.log(`  chaves cruas: ${uniq.length === 0 ? "nenhuma" : uniq.join(", ")}`);
  if (uniq.length > 0) failures += uniq.length;
  if (process.env.DUMP === "1") fs.writeFileSync(`.tmp-aba-${label.replace(/\W/g, "_")}.txt`, text);
  const excerpt = text.replace(/\s+/g, " ");
  const marker = excerpt.indexOf("Premade Flex");
  console.log(`  texto: ${excerpt.slice(marker + 700, marker + 1800)}`);
}

socket.close();
chrome.kill();
try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {
  // o perfil temporário pode ficar preso por um instante; não é erro do teste
}
if (consoleProblems.length > 0) {
  console.log("\n===== problemas no console do navegador =====");
  for (const entry of [...new Set(consoleProblems)]) console.log("  " + entry);
  failures += consoleProblems.length;
} else {
  console.log("\nconsole do navegador: limpo");
}
console.log(`\nfalhas: ${failures}`);
process.exit(failures > 0 ? 1 : 0);
