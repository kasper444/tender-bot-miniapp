// Доступ к API аукциона: сессия из launch-параметров MAX, запросы, разбор ошибок.
// Если сервер недоступен, а в config.js включён demoFallback — работаем на демо-данных
// (интерфейс помечает это плашкой, чтобы никто не принял демо за реальные торги).
import { DEMO_CARD, DEMO_LIST } from "./demo";
import type { BidResult, Session, TenderCard, TenderListItem } from "./types";

declare global {
  interface Window {
    WebApp?: any;
    AUCTION_CONFIG?: { apiBase?: string; demoFallback?: boolean };
  }
}

const cfg = window.AUCTION_CONFIG ?? {};
export let API_BASE = (cfg.apiBase ?? "").replace(/\/$/, "");
const DEMO_FALLBACK = cfg.demoFallback !== false;

let token: string | null = null;
let demo = false;
let offline = false;

export const isDemo = () => demo;
export const isOffline = () => offline;

/** Принудительный демо-режим (start_param=demo) — для показа интерфейса без сервера. */
export function forceDemo() {
  demo = true;
  offline = true;
}

/**
 * Актуальный адрес API. Временный контур живёт на туннеле, адрес которого меняется при
 * перезапуске, поэтому рядом с приложением (тот же origin, без CORS) лежит `api.json`,
 * который обновляет сторож туннеля. Если он новее конфигурации — берём адрес оттуда.
 */
export async function resolveApiBase(): Promise<string> {
  try {
    const res = await fetch(`./api.json?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { apiBase?: string };
      const fromJson = (body.apiBase ?? "").replace(/\/$/, "");
      if (fromJson && fromJson !== API_BASE) {
        console.info(`[auction] адрес API обновлён по api.json: ${fromJson}`);
        API_BASE = fromJson;
      }
    }
  } catch {
    /* необязательный шаг: при недоступности используем адрес из config.js */
  }
  return API_BASE;
}

export class ApiError extends Error {
  code: string;
  http: number;
  detail: Record<string, any>;
  constructor(code: string, http: number, message: string, detail: Record<string, any> = {}) {
    super(message);
    this.code = code;
    this.http = http;
    this.detail = detail;
  }
}

async function http<T>(path: string, init: RequestInit = {}, withAuth = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as any) };
  if (withAuth && token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (e) {
    offline = true;
    throw new ApiError("NETWORK", 0, "Нет связи с сервером", { reason: String(e) });
  }
  offline = false;
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new ApiError(
      body?.code ?? `HTTP_${res.status}`,
      res.status,
      body?.message ?? "Не удалось выполнить запрос",
      body?.detail ?? {},
    );
  }
  return body as T;
}

/** Обёртка «запрос с демо-подстановкой»: сетевые сбои не ломают интерфейс. */
async function withDemo<T>(run: () => Promise<T>, fallback: () => T): Promise<T> {
  if (demo) return fallback();
  try {
    return await run();
  } catch (e) {
    if (e instanceof ApiError && e.code === "NETWORK" && DEMO_FALLBACK) {
      demo = true;
      offline = true;
      return fallback();
    }
    throw e;
  }
}

// ------------------------------------------------------------------ сессия
export async function startSession(initData: string): Promise<Session> {
  const w = window.WebApp;
  const launch = {
    platform: w?.platform ?? null,
    version: w?.version ?? null,
    context: safeCall(() => w?.getLaunchContext?.()),
  };
  const session = await withDemo(
    () => http<Session>("/auth/session", { method: "POST", body: JSON.stringify({ init_data: initData, launch_context: launch }) }, false),
    () => DEMO_SESSION,
  );
  token = session.token;
  return session;
}

export function logout() {
  token = null;
  demo = false;
  offline = false;
}

function safeCall<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ тендеры
export const Api = {
  listTenders: (filter: "active" | "finished" | "all" = "active") =>
    withDemo(
      () => http<{ items: TenderListItem[] }>(`/tenders?filter=${filter}`),
      () => ({ items: filter === "active" ? DEMO_LIST : [] }),
    ),

  tenderByCode: (code: string) =>
    withDemo(
      () => http<TenderCard>(`/tenders/by-code/${encodeURIComponent(code)}`),
      () => DEMO_CARD,
    ),

  tender: (id: string) =>
    withDemo(
      () => http<TenderCard>(`/tenders/${id}`),
      () => DEMO_CARD,
    ),

  placeBid: (id: string, body: { mode: "step" | "manual"; amount?: string; idempotency_key: string; confirm_large?: boolean }) =>
    http<BidResult>(`/tenders/${id}/bids`, { method: "POST", body: JSON.stringify(body) }),

  cancelTender: (id: string) => http(`/tenders/${id}/cancel`, { method: "POST" }),
  confirmTender: (id: string) => http<TenderCard>(`/tenders/${id}/confirm`, { method: "POST" }),
  restartTender: (id: string, body: { duration_hours?: number; start_price?: string } = {}) =>
    http<{ tender: TenderCard }>(`/tenders/${id}/restart`, { method: "POST", body: JSON.stringify(body) }),

  createTender: (body: Record<string, unknown>) =>
    http<{ tender: TenderCard }>("/tenders", { method: "POST", body: JSON.stringify(body) }),

  presign: (filename: string, contentType: string, bytes: number) =>
    http<{ driver: string; key: string; upload_url: string; public_url: string }>("/media/presign", {
      method: "POST",
      body: JSON.stringify({ filename, content_type: contentType, bytes }),
    }),

  uploadPhoto: async (file: File) => {
    const pre = await Api.presign(file.name, file.type || "image/jpeg", file.size);
    const res = await fetch(`${API_BASE}${new URL(pre.upload_url).pathname}`, {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });
    const body = await res.json();
    if (!res.ok) throw new ApiError(body?.code ?? "UPLOAD_FAILED", res.status, body?.message ?? "Не удалось загрузить фото", body?.detail ?? {});
    return { key: body.key as string, preview_url: (body.preview_url ?? pre.public_url) as string, bytes: body.bytes as number };
  },
};

const DEMO_SESSION: Session = {
  token: "demo",
  is_admin: true,
  user: { id: "demo", max_user_id: 0, first_name: "Демо-организатор" },
  start_param: "demo",
  chat: null,
};

// ------------------------------------------------------------------ утилиты
export function uuid(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Формат денег для показа: 20.5 → «20,50». */
export function money(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toFixed(2).replace(".", ",");
}

export function moneyRub(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  const rub = Math.floor(n);
  const kop = Math.round((n - rub) * 100);
  return kop === 0 ? `${rub} руб` : `${rub} руб ${String(kop).padStart(2, "0")} коп`;
}

export function haptic(kind: "light" | "medium" | "success" | "error" = "light") {
  const h = window.WebApp?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === "success" || kind === "error") h.notificationOccurred(kind);
    else h.impactOccurred(kind);
  } catch {
    /* вне MAX транспорт недоступен — это нормально */
  }
}

export const NETWORK_LABEL: Record<string, string> = { magnit: "Магнит", pyaterochka: "Пятёрочка" };

export const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  active: "Идут торги",
  extended: "Продлены",
  finished: "Завершён",
  finished_no_bids: "Без ставок",
  confirmed: "Сделка подтверждена",
  unclaimed: "Не подтверждён",
  cancelled: "Отменён",
};
