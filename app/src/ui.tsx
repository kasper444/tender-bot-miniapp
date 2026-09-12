// Мелкие переиспользуемые элементы интерфейса (тёмная тема, крупные кнопки ≥48px).
import { useEffect, useState, type ReactNode } from "react";
import { NETWORK_LABEL, STATUS_LABEL, money, moneyRub } from "./api";
import type { FeedItem, Leader, MediaItem } from "./types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function Banner({ kind, children }: { kind: "demo" | "error" | "ok"; children: ReactNode }) {
  return <div className={`banner banner-${kind}`}>{children}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active" ? "badge-active"
    : status === "extended" ? "badge-extended"
    : status === "finished_no_bids" || status === "cancelled" || status === "unclaimed" ? "badge-err"
    : "badge-finished";
  return <span className={`badge ${cls}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Skeleton({ lines = 3, photo = false }: { lines?: number; photo?: boolean }) {
  return (
    <Card>
      {photo && <div className="skeleton sk-photo" />}
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton sk-line" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </Card>
  );
}

/** Тик раз в секунду — для таймера. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Таймер обратного отсчёта. BR-07: считаем по серверному времени, `skewMs` — разница
 * часов сервера и клиента, замеренная в момент получения данных. Дробная часть не показывается,
 * последняя минута — акцентный цвет.
 */
export function Timer({ endsAt, skewMs = 0 }: { endsAt: string; skewMs?: number }) {
  const now = useNow();
  const endsMs = new Date(endsAt).getTime();
  const sec = Math.max(0, Math.floor((endsMs - (now + skewMs)) / 1000));
  if (!Number.isFinite(endsMs)) return <span className="timer">—</span>;
  if (sec <= 0) return <span className="timer">время истекло</span>;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const text = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return (
    <span className={`timer ${sec <= 60 ? "hot" : ""}`} title={`до ${new Date(endsMs).toLocaleString("ru-RU")}`}>
      до конца {text}
    </span>
  );
}

export function Gallery({ media }: { media: MediaItem[] }) {
  const items = media.filter((m) => m.preview_url);
  if (!items.length) return <div className="muted small">Фотографий нет</div>;
  return (
    <div className="gallery">
      {items.map((m, i) => (
        <img key={m.key ?? i} src={m.preview_url ?? undefined} alt={`Фото партии ${i + 1}`} loading="lazy" />
      ))}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return <span className="avatar">{initials || "?"}</span>;
}

export function Leaders({ leaders, currentUserId }: { leaders: Leader[]; currentUserId?: string | null }) {
  if (!leaders.length) return <div className="muted small">Ставок пока нет — сделайте первую.</div>;
  return (
    <div className="leaders">
      {leaders.map((l) => (
        <div key={`${l.user_id}-${l.place}`} className={`leader ${l.place === 1 ? "first" : ""}`}>
          <span className="name">
            <Avatar name={l.name} />
            {l.user_id === currentUserId ? `${l.name} (вы)` : l.name}
          </span>
          <span className="mono">
            {l.place === 1 ? "🥇 " : l.place === 2 ? "🥈 " : "🥉 "}
            {moneyRub(l.amount)} <span className="muted small">({money(l.amount)})</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function Feed({ items, currentUserId }: { items: FeedItem[]; currentUserId?: string | null }) {
  if (!items.length) return <div className="muted small">Лента ставок пуста.</div>;
  return (
    <div className="feed">
      {items.map((b) => (
        <div key={b.id} className="feed-item">
          <span>
            <b>{b.user_id === currentUserId ? "Вы" : b.name}</b>{" "}
            {b.mode === "step" ? "подняли цену до" : "предложили"}{" "}
            <span className="mono">{moneyRub(b.amount)}</span>
          </span>
          <span className="t">
            {new Date(b.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function QuantitySub({ city, network, quantity }: { city: string; network: string; quantity: number }) {
  return (
    <div className="muted small">
      {city} · {NETWORK_LABEL[network] ?? network} · {quantity.toLocaleString("ru-RU")} шт
    </div>
  );
}
