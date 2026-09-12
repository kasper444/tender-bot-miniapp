// Типы данных API аукциона (совпадают с docs/API.md и fn_tender_card в БД).

export type TenderStatus =
  | "draft"
  | "active"
  | "extended"
  | "finished"
  | "finished_no_bids"
  | "confirmed"
  | "unclaimed"
  | "cancelled";

export type Network = "magnit" | "pyaterochka";

export interface MediaItem {
  type: "image";
  key: string;
  preview_key?: string | null;
  preview_url?: string | null;
  bytes?: number;
  width?: number | null;
  height?: number | null;
}

export interface Leader {
  place: number;
  user_id: string;
  name: string;
  amount: number;
  created_at: string;
}

export interface FeedItem {
  id: string;
  seq: number | string;
  user_id: string;
  name: string;
  amount: number;
  mode: string;
  created_at: string;
}

export interface Counterparty {
  user_id: string;
  max_user_id: number;
  name: string;
  username: string | null;
  phone: string | null;
  phone_verified: boolean;
}

export interface Contacts {
  visible_to: { owner: boolean; winner: boolean };
  counterparty: Counterparty;
}

export interface TenderCard {
  id: string;
  public_code: string;
  city: string;
  network: Network;
  quantity: number;
  status: TenderStatus;
  start_price: number;
  current_price: number;
  next_min_bid: number;
  step: number;
  bids_count: number;
  started_at: string;
  ends_at: string;
  seconds_left: number;
  extensions_used: number;
  extensions_left: number;
  hard_deadline_at: string;
  duration_hours: number;
  media: MediaItem[];
  version: number;
  server_time: string;
  server_epoch_ms: number;
  viewer: {
    is_owner: boolean;
    is_winner: boolean;
    is_leader: boolean;
    can_bid: boolean;
    can_confirm: boolean;
  };
  winner: { user_id: string; name: string; amount: number } | null;
  leaders: Leader[];
  bids: FeedItem[];
  contacts: Contacts | null;
}

export interface TenderListItem {
  id: string;
  public_code: string;
  city: string;
  network: Network;
  quantity: number;
  status: TenderStatus;
  start_price: number;
  current_price: number;
  next_min_bid: number;
  bids_count: number;
  started_at: string | null;
  ends_at: string | null;
  extensions_used: number;
  seconds_left: number;
  preview_url: string | null;
  winner_id: string | null;
  winner_name: string | null;
}

export interface Session {
  token: string;
  is_admin: boolean;
  user: { id: string; max_user_id: number; first_name: string };
  start_param: string | null;
  chat: { id: number; type?: string } | null;
  server_time?: string;
}

export interface BidResult {
  bid: { id: string; amount: number; replay: boolean };
  next_min_bid: number;
  tender: TenderCard;
}
