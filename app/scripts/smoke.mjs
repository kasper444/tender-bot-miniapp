// Дымовой тест собранного мини-приложения: рендерим реальный бандл из docs/ в JSDOM
// (браузера рядом нет) и проверяем, что интерфейс собирается без ошибок.
//
//     node scripts/smoke.mjs            # проверка списка (демо-режим)
//     node scripts/smoke.mjs tender     # проверка карточки тендера
//
// Ожидаемо: API на 127.0.0.1:8010 недоступен → включается демо-режим с плашкой «ДЕМО-РЕЖИМ».
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const docs = resolve(here, "..", "..", "docs");
const bundle = readdirSync(join(docs, "assets")).find((f) => f.endsWith(".js"));
if (!bundle) throw new Error("в docs/assets нет собранного бандла — сначала npm run build");

const mode = process.argv[2] ?? "list";
const startParam = mode === "tender" ? "tender_BK-2026-000001" : mode === "create" ? "create" : null;

// Живой прогон: берём реальный docs/config.js и настоящий initData из файла,
// чтобы проверить приложение против опубликованного API, а не против демо-данных.
const liveConfig = process.env.USE_DOCS_CONFIG === "1";
const initDataFile = process.env.INITDATA_FILE;
const realInitData = initDataFile ? readFileSync(initDataFile, "utf8").trim() : "";

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: liveConfig ? "https://kasper444.github.io/tender-bot-miniapp/" : "https://kasper444.github.io/tender-bot-miniapp/?demo=1",
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
// Node 22 держит глобальный navigator только для чтения — переопределяем через дескриптор
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true, writable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.MutationObserver = window.MutationObserver;
globalThis.Node = window.Node;
globalThis.location = window.location;
globalThis.History = window.History;
globalThis.URLSearchParams = window.URLSearchParams ?? URLSearchParams;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
if (liveConfig) {
  // читаем реальную конфигурацию сборки (без eval): адрес API и флаг демо-фолбэка
  const src = readFileSync(join(docs, "config.js"), "utf8");
  const m = src.match(/apiBase:\s*"([^"]*)"/);
  window.AUCTION_CONFIG = { apiBase: m ? m[1] : "", demoFallback: /demoFallback:\s*true/.test(src) };
  console.log("конфигурация сборки: apiBase =", window.AUCTION_CONFIG.apiBase);
} else {
  window.AUCTION_CONFIG = { apiBase: "http://127.0.0.1:8010", demoFallback: true };
}
// Имитируем запуск из MAX: кнопка «Участвовать» передаёт start_param
if (startParam || realInitData) {
  window.WebApp = {
    initData: realInitData,
    initDataUnsafe: { start_param: startParam, user: { id: 169643859, first_name: "Дмитрий" } },
    platform: "test",
  };
}

const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.message)));
process.on("unhandledRejection", (e) => errors.push(`unhandled: ${String(e)}`));

// Бандл лежит вне app/, поэтому Node считает .js файлом CJS — копируем в .mjs для импорта
const tmp = join(docs, "assets", "__smoke_bundle.mjs");
writeFileSync(tmp, readFileSync(join(docs, "assets", bundle), "utf8"));
await import(pathToFileURL(tmp).href);

// Ждём, пока приложение выйдет из состояния загрузки (запрос к API может идти по сети)
const rootEl = window.document.getElementById("root");
const deadline = Date.now() + 25_000;
while (Date.now() < deadline) {
  const txt = (rootEl?.textContent ?? "").trim();
  if (txt && !txt.includes("Проверяем данные запуска")) break;
  await new Promise((r) => setTimeout(r, 400));
}
await new Promise((r) => setTimeout(r, 400));

const root = window.document.getElementById("root");
const text = (root?.textContent ?? "").replace(/\s+/g, " ").trim();
console.log("--- текст экрана ---");
console.log(text.slice(0, 900));
console.log("--- кнопки ---");
console.log([...window.document.querySelectorAll("button")].map((b) => b.textContent.trim()).join(" | "));
console.log("--- ошибки ---");
console.log(errors.length ? errors.join(" | ") : "нет");
if (!root || root.children.length === 0) {
  console.error("ПРОВАЛ: приложение не отрисовалось");
  process.exit(1);
}
console.log("\nOK: интерфейс отрисован, элементов в DOM:", root.querySelectorAll("*").length);
// приложение держит интервал опроса — завершаем процесс явно
process.exit(0);
