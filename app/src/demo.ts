// Демонстрационные данные: показываются ТОЛЬКО если API недоступен (или ?startapp=demo).
// Интерфейс в этом режиме обязан показать плашку «ДЕМО» — данные не с сервера.
import type { TenderCard, TenderListItem } from "./types";

const IMG = "demo/box_bayan_800.jpg";
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

export const DEMO_CARD: TenderCard = {
  id: "demo-tender",
  public_code: "BK-2026-000001",
  city: "Подольск",
  network: "magnit",
  quantity: 12000,
  status: "active",
  start_price: 20.5,
  current_price: 21.21,
  next_min_bid: 21.43,
  step: 0.22,
  bids_count: 3,
  started_at: iso(now - 3600_000),
  ends_at: iso(now + 4 * 3600_000 + 12 * 60_000),
  seconds_left: 4 * 3600 + 12 * 60,
  extensions_used: 0,
  extensions_left: 3,
  hard_deadline_at: iso(now + 70 * 3600_000),
  duration_hours: 24,
  media: [{ type: "image", key: "demo/box_bayan_800.jpg", preview_url: IMG, bytes: 152731 }],
  version: 3,
  server_time: iso(now),
  server_epoch_ms: now,
  viewer: { is_owner: false, is_winner: false, is_leader: false, can_bid: true, can_confirm: false },
  winner: null,
  leaders: [
    { place: 1, user_id: "u2", name: "Пётр Овощеводов", amount: 21.21, created_at: iso(now - 600_000) },
    { place: 2, user_id: "u3", name: "Иван Фермеров", amount: 21.0, created_at: iso(now - 900_000) },
    { place: 3, user_id: "u1", name: "Вы", amount: 20.71, created_at: iso(now - 1_800_000) },
  ],
  bids: [
    { id: "b3", seq: 3, user_id: "u2", name: "Пётр Овощеводов", amount: 21.21, mode: "manual", created_at: iso(now - 600_000) },
    { id: "b2", seq: 2, user_id: "u3", name: "Иван Фермеров", amount: 21.0, mode: "manual", created_at: iso(now - 900_000) },
    { id: "b1", seq: 1, user_id: "u1", name: "Иван Фермеров", amount: 20.71, mode: "step", created_at: iso(now - 1_800_000) },
  ],
  contacts: null,
};

export const DEMO_LIST: TenderListItem[] = [
  {
    id: DEMO_CARD.id,
    public_code: DEMO_CARD.public_code,
    city: DEMO_CARD.city,
    network: DEMO_CARD.network,
    quantity: DEMO_CARD.quantity,
    status: DEMO_CARD.status,
    start_price: DEMO_CARD.start_price,
    current_price: DEMO_CARD.current_price,
    next_min_bid: DEMO_CARD.next_min_bid,
    bids_count: DEMO_CARD.bids_count,
    started_at: DEMO_CARD.started_at,
    ends_at: DEMO_CARD.ends_at,
    extensions_used: 0,
    seconds_left: DEMO_CARD.seconds_left,
    preview_url: IMG,
    winner_id: null,
    winner_name: null,
  },
  {
    id: "demo-finished",
    public_code: "BK-2026-000042",
    city: "Волжский",
    network: "pyaterochka",
    quantity: 9000,
    status: "finished",
    start_price: 19.0,
    current_price: 23.75,
    next_min_bid: 23.99,
    bids_count: 11,
    started_at: iso(now - 30 * 3600_000),
    ends_at: iso(now - 6 * 3600_000),
    extensions_used: 1,
    seconds_left: 0,
    preview_url: IMG,
    winner_id: "u9",
    winner_name: "Сергей Бахчеводов",
  },
];
