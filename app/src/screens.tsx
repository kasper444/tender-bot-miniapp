// Экраны мини-приложения: карточка тендера, список, создание тендера.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Api, ApiError, haptic, isDemo, money, moneyRub, NETWORK_LABEL, uuid } from "./api";
import type { MediaItem, Session, TenderCard, TenderListItem } from "./types";
import { Avatar, Banner, Card, Feed, Gallery, Leaders, QuantitySub, Row, Skeleton, StatusBadge, Timer } from "./ui";

type Status = "loading" | "ready" | "error";

// --------------------------------------------------------------- карточка тендера
export function TenderScreen({ code, id, session, onBack }: { code?: string; id?: string; session: Session; onBack: () => void }) {
  const [card, setCard] = useState<TenderCard | null>(null);
  const [state, setState] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const skewRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = id ? await Api.tender(id) : await Api.tenderByCode(code ?? "");
      skewRef.current = data.server_epoch_ms - Date.now();
      setCard(data);
      setState("ready");
      setError(null);
    } catch (e) {
      const err = e as ApiError;
      setError(err.code === "NETWORK" ? "Нет связи с сервером." : `${err.message} (${err.code})`);
      setState((s) => (s === "loading" ? "error" : s));
      if (card) setState("ready"); // уже показанную карточку не гасим — покажем плашку поверх
    }
  }, [code, id, card]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    const t = setInterval(() => {
      if (alive && document.visibilityState === "visible") void load();
    }, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, id]);

  if (state === "loading") return <div className="wrap"><Skeleton photo lines={4} /></div>;
  if (state === "error" || !card)
    return (
      <div className="wrap">
        <Banner kind="error">{error ?? "Тендер не найден"}</Banner>
        <button className="ghost" onClick={onBack}>К списку тендеров</button>
        <button onClick={() => void load()}>Повторить</button>
      </div>
    );

  const trading = card.status === "active" || card.status === "extended";

  return (
    <div className="wrap">
      {isDemo() && (
        <Banner kind="demo">
          <b>ДЕМО-РЕЖИМ.</b> Нет связи с API аукциона — показаны демонстрационные данные, ставки не сохраняются.
        </Banner>
      )}
      {error && !isDemo() && <Banner kind="error">{error}</Banner>}

      <div className="price-row" style={{ marginTop: 4 }}>
        <div>
          <div className="h1">{card.public_code}</div>
          <QuantitySub city={card.city} network={card.network} quantity={card.quantity} />
        </div>
        <StatusBadge status={card.status} />
      </div>

      <div style={{ marginTop: 12 }}>
        <Gallery media={card.media} />
      </div>

      <Card>
        <div className="price-row">
          <div>
            <div className="h2">Текущая цена</div>
            <div className="price mono">
              {money(card.current_price)}<span>₽/шт</span>
            </div>
          </div>
          {trading && <Timer endsAt={card.ends_at} skewMs={skewRef.current} />}
        </div>
        <div className="hint">
          Шаг {(card.step * 100).toFixed(0) === "100" ? "1,00" : money(card.step)} ₽ (1% от текущей цены, округление вверх).
          Ставок: {card.bids_count}. Продлений антиснайпера: {card.extensions_used} из 3.
        </div>
      </Card>

      <BidPanel card={card} onDone={load} />

      <Card>
        <div className="h2">Параметры</div>
        <Row k="Город" v={card.city} />
        <Row k="Сеть" v={NETWORK_LABEL[card.network] ?? card.network} />
        <Row k="Количество" v={`${card.quantity.toLocaleString("ru-RU")} шт`} />
        <Row k="Начальная цена" v={`${money(card.start_price)} ₽/шт`} />
        <Row k="Начало" v={new Date(card.started_at).toLocaleString("ru-RU")} />
        <Row k={trading ? "Окончание" : "Окончание"} v={new Date(card.ends_at).toLocaleString("ru-RU")} />
        <Row k="Жёсткий дедлайн" v={new Date(card.hard_deadline_at).toLocaleString("ru-RU")} />
      </Card>

      {!trading && <FinishPanel card={card} session={session} />}

      <Card>
        <div className="h2">Топ-3</div>
        <Leaders leaders={card.leaders} currentUserId={session.user.id} />
      </Card>

      <Card>
        <div className="h2">Лента ставок</div>
        <Feed items={card.bids} currentUserId={session.user.id} />
      </Card>

      <button className="ghost" onClick={onBack}>К списку тендеров</button>
    </div>
  );
}

// --------------------------------------------------------------- панель ставок
function BidPanel({ card, onDone }: { card: TenderCard; onDone: () => Promise<void> }) {
  const [manual, setManual] = useState("");
  const [confirming, setConfirming] = useState<null | { mode: "step" | "manual"; amount: string; warn?: string }>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<null | { kind: "ok" | "error"; text: string }>(null);
  const [cooldown, setCooldown] = useState(0);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const trading = card.status === "active" || card.status === "extended";
  const isLeader = card.viewer.is_leader;
  const canBid = card.viewer.can_bid && trading && !isLeader;
  const stepAmount = card.next_min_bid;
  const minAmount = card.current_price + card.step;

  const manualNum = Number(manual.replace(",", "."));
  const manualValid = manual.trim() !== "" && Number.isFinite(manualNum) && manualNum >= minAmount - 1e-9;
  const manualError = manual.trim() !== "" && !manualValid
    ? `Ставка слишком низкая. Минимум: ${moneyRub(minAmount)}`
    : null;

  async function send(mode: "step" | "manual", amount: string) {
    if (!keyRef.current) keyRef.current = uuid(); // один ключ на одну попытку ставки (BR-05)
    setBusy(true);
    setNotice(null);
    try {
      const res = await Api.placeBid(card.id, {
        mode,
        amount: mode === "manual" ? amount : undefined,
        idempotency_key: keyRef.current,
      });
      keyRef.current = null;
      haptic("success");
      setNotice({ kind: "ok", text: `Ставка принята: ${moneyRub(res.bid.amount)}${res.bid.replay ? " (повтор запроса, дубликата нет)" : ""}` });
      setManual("");
      await onDone();
    } catch (e) {
      const err = e as ApiError;
      haptic("error");
      if (err.code === "NETWORK") {
        setNotice({ kind: "error", text: "Ставка не отправлена. Проверьте связь и повторите — дубликата не будет." });
      } else if (err.http === 409) {
        const fresh = (err.detail?.current_price as number) ?? null;
        const min = (err.detail?.next_min_bid as number) ?? null;
        keyRef.current = null;
        setNotice({
          kind: "error",
          text:
            err.code === "SELF_OUTBID" ? "Вы уже делаете максимальную ставку."
            : `Цена изменилась${fresh ? `, текущая: ${money(fresh)} ₽` : ""}${min ? `. Новая минимальная ставка: ${moneyRub(min)}` : ""}.`,
        });
        await onDone();
      } else if (err.http === 429) {
        const wait = Number(err.detail?.retry_after ?? 2);
        setCooldown(Math.max(2, Math.ceil(wait)));
        keyRef.current = null;
        setNotice({ kind: "error", text: `Слишком часто, подождите ${Math.max(2, Math.ceil(wait))} сек.` });
      } else if (err.http === 403) {
        setNotice({ kind: "error", text: "Вы не участник этого чата — ставка недоступна." });
      } else {
        keyRef.current = null;
        setNotice({ kind: "error", text: `${err.message}${err.code ? ` (${err.code})` : ""}` });
      }
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  function askManual() {
    const amount = manualNum.toFixed(2);
    const over = card.current_price > 0 ? (manualNum / card.current_price - 1) * 100 : 0;
    setConfirming({
      mode: "manual",
      amount,
      warn: over > 50 ? `Вы вводите цену на ${Math.round(over)}% выше текущей. Продолжить?` : undefined,
    });
  }

  if (!trading) return null;

  return (
    <>
      <Card>
        {notice && <Banner kind={notice.kind === "ok" ? "ok" : "error"}>{notice.text}</Banner>}
        {isLeader ? (
          <button disabled>Вы лидируете — ваша ставка максимальная</button>
        ) : (
          <button className="bid" disabled={!canBid || busy || cooldown > 0} onClick={() => setConfirming({ mode: "step", amount: stepAmount.toFixed(2) })}>
            {busy ? "Отправляем…" : cooldown > 0 ? `Подождите ${cooldown} сек` : `Сделать ставку: ${money(stepAmount)} ₽`}
          </button>
        )}

        <label htmlFor="manual">Своя цена, ₽/шт</label>
        <input
          id="manual"
          inputMode="decimal"
          placeholder={`не меньше ${money(minAmount)}`}
          className={manualError ? "invalid" : ""}
          value={manual}
          onChange={(e) => setManual(e.target.value.replace(/[^\d.,]/g, ""))}
        />
        {manualError && <div className="field-error">{manualError}</div>}
        <div className="hint">Минимум: {moneyRub(minAmount)}. Округление до копеек вверх.</div>
        <button
          className="ghost"
          style={{ marginTop: 8 }}
          disabled={!manualValid || busy || !canBid || cooldown > 0}
          onClick={askManual}
        >
          Подтвердить свою цену
        </button>
      </Card>

      {confirming && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", padding: 20, zIndex: 10 }}
          onClick={() => !busy && setConfirming(null)}
        >
          <div className="card" style={{ margin: 0, width: "100%", maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="h1" style={{ fontSize: 18 }}>
              {confirming.warn ? "Подтверждение цены" : "Подтвердите ставку"}
            </div>
            <div style={{ margin: "10px 0" }}>
              <div className="price mono" style={{ fontSize: 30 }}>{money(Number(confirming.amount))}<span>₽/шт</span></div>
              <div className="muted small">
                за {card.quantity.toLocaleString("ru-RU")} шт ≈ {money(Number(confirming.amount) * card.quantity)} ₽
              </div>
            </div>
            {confirming.warn && <Banner kind="error">{confirming.warn}</Banner>}
            <button className="bid" disabled={busy} onClick={() => void send(confirming.mode, confirming.amount)}>
              {busy ? "Отправляем…" : "Подтвердить"}
            </button>
            <button className="ghost" disabled={busy} onClick={() => setConfirming(null)}>Отмена</button>
          </div>
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------- итог торгов
function FinishPanel({ card, session }: { card: TenderCard; session: Session }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      setMsg(ok);
      haptic("success");
    } catch (e) {
      const err = e as ApiError;
      setMsg(`${err.message}${err.code ? ` (${err.code})` : ""}`);
      haptic("error");
    } finally {
      setBusy(false);
    }
  }

  if (card.status === "finished_no_bids")
    return (
      <Card>
        <div className="h2">Итог</div>
        <div>Ставок не было — тендер завершён без победителя.</div>
        {session.is_admin && (
          <button style={{ marginTop: 10 }} disabled={busy} onClick={() => void act(() => Api.restartTender(card.id), "Тендер перезапущен")}>
            Перезапустить
          </button>
        )}
        {msg && <div className="hint">{msg}</div>}
      </Card>
    );

  const winner = card.winner;
  return (
    <Card>
      <div className="h2">Итог</div>
      {winner ? (
        <>
          <div className="leader first" style={{ marginBottom: 10 }}>
            <span className="name"><Avatar name={winner.name} />{winner.name}</span>
            <span className="mono">{moneyRub(winner.amount)}</span>
          </div>
          {card.contacts ? (
            <div className="stack">
              <Row k="Имя" v={card.contacts.counterparty.name} />
              <Row k="Профиль MAX" v={card.contacts.counterparty.username ?? card.contacts.counterparty.max_user_id} />
              <Row k="Телефон" v={card.contacts.counterparty.phone ?? "не указан"} />
              <a href={`https://max.ru/${card.contacts.counterparty.username ?? ""}`}>Написать в MAX</a>
            </div>
          ) : (
            <div className="muted small">Контакты видны только организатору и победителю.</div>
          )}
          {card.viewer.can_confirm && (
            <button className="bid" style={{ marginTop: 10 }} disabled={busy}
              onClick={() => void act(() => Api.confirmTender(card.id), "Сделка подтверждена")}>
              Подтверждаю выкуп
            </button>
          )}
          {session.is_admin && card.status === "finished" && (
            <button className="danger" style={{ marginTop: 8 }} disabled={busy}
              onClick={() => void act(() => Api.cancelTender(card.id), "Отменено")}>
              Отменить тендер (только без ставок)
            </button>
          )}
        </>
      ) : (
        <div className="muted">Победитель не определён.</div>
      )}
      {msg && <div className="hint">{msg}</div>}
    </Card>
  );
}

// --------------------------------------------------------------- список тендеров
export function ListScreen({ session, onOpen, onCreate }: { session: Session; onOpen: (t: TenderListItem) => void; onCreate: () => void }) {
  const [tab, setTab] = useState<"active" | "finished">("active");
  const [items, setItems] = useState<TenderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const res = await Api.listTenders(tab);
        if (alive) {
          setItems(res.items);
          setError(null);
        }
      } catch (e) {
        if (alive) setError((e as ApiError).message);
      }
    };
    setItems(null);
    void run();
    const t = setInterval(run, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tab]);

  const list = useMemo(() => items ?? [], [items]);

  return (
    <div className="wrap">
      {isDemo() && (
        <Banner kind="demo"><b>ДЕМО-РЕЖИМ.</b> API аукциона недоступен — показаны демонстрационные тендеры.</Banner>
      )}
      {error && <Banner kind="error">{error}</Banner>}

      <div className="price-row">
        <div>
          <div className="h1">Аукцион гофротары</div>
          <div className="muted small">
            {session.user.first_name}{session.is_admin ? " · организатор" : " · участник"}
          </div>
        </div>
      </div>

      <div className="two" style={{ marginTop: 12 }}>
        <button className={tab === "active" ? "" : "ghost"} onClick={() => setTab("active")}>Идут торги</button>
        <button className={tab === "finished" ? "" : "ghost"} onClick={() => setTab("finished")}>Завершённые</button>
      </div>

      {items === null ? (
        <div style={{ marginTop: 12 }}><Skeleton photo lines={3} /></div>
      ) : list.length === 0 ? (
        <Card><div className="muted">{tab === "active" ? "Активных тендеров нет." : "Завершённых тендеров нет."}</div></Card>
      ) : (
        <div className="stack" style={{ marginTop: 12 }}>
          {list.map((t) => (
            <Card key={t.id} className="tap">
              <div className="list-item" onClick={() => onOpen(t)}>
                {t.preview_url ? <img src={t.preview_url} alt="" /> : <img alt="" />}
                <div className="meta">
                  <div className="title">{t.public_code}</div>
                  <QuantitySub city={t.city} network={t.network} quantity={t.quantity} />
                  <div className="mono" style={{ marginTop: 4 }}>
                    {money(t.current_price)} ₽/шт <span className="muted small">· ставок {t.bids_count}</span>
                  </div>
                  <div className="small" style={{ marginTop: 4 }}>
                    <StatusBadge status={t.status} />
                    {t.status === "active" || t.status === "extended"
                      ? <span style={{ marginLeft: 8 }}><Timer endsAt={t.ends_at ?? ""} /></span>
                      : t.winner_name ? <span className="muted" style={{ marginLeft: 8 }}>победитель: {t.winner_name}</span> : null}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {session.is_admin && <button style={{ marginTop: 12 }} onClick={onCreate}>Создать тендер</button>}
    </div>
  );
}

// --------------------------------------------------------------- создание тендера
function compress(file: File): Promise<{ blob: Blob; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas недоступен"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve({ blob, previewUrl: url }) : reject(new Error("не удалось сжать фото"))),
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => reject(new Error("не удалось прочитать файл"));
    img.src = url;
  });
}

export function CreateScreen({ onBack, onCreated }: { onBack: () => void; onCreated: (t: TenderCard) => void }) {
  const [city, setCity] = useState("");
  const [network, setNetwork] = useState<"magnit" | "pyaterochka">("magnit");
  const [quantity, setQuantity] = useState("8400");
  const [duration, setDuration] = useState("24");
  const [price, setPrice] = useState("");
  const [media, setMedia] = useState<{ blob: Blob; previewUrl: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const qty = Number(quantity);
  const qtyError = Number.isFinite(qty) && qty >= 8400 && qty <= 25200 ? null : "Количество: целое число от 8 400 до 25 200 шт.";
  const priceMatch = price.match(/^\d{1,6}[.,]\d{2}$/);
  const priceError = price.trim() === "" ? "Укажите начальную цену" : !priceMatch ? "Цена: два знака после запятой, например 20,50" : null;

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const next = [...media];
    for (const f of Array.from(files)) {
      if (next.length >= 5) break;
      if (!f.type.startsWith("image/")) {
        setError("Принимаются только фотографии");
        continue;
      }
      try {
        next.push(await compress(f));
      } catch (e) {
        setError(String((e as Error).message));
      }
    }
    setMedia(next);
  }

  async function publish() {
    if (qtyError || priceError || !media.length) {
      setError(!media.length ? "Нужно хотя бы одно фото" : (qtyError ?? priceError ?? "Проверьте поля"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uploaded: MediaItem[] = [];
      for (const m of media) {
        const file = new File([m.blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });
        const res = await Api.uploadPhoto(file);
        uploaded.push({ type: "image", key: res.key, preview_url: res.preview_url, bytes: res.bytes });
      }
      const created = await Api.createTender({
        city: city.trim(),
        network,
        quantity: qty,
        duration_hours: Number(duration),
        start_price: price.replace(",", "."),
        media: uploaded,
        client_request_id: uuid(),
      });
      haptic("success");
      onCreated(created.tender);
    } catch (e) {
      const err = e as ApiError;
      haptic("error");
      setError(`${err.message}${err.code ? ` (${err.code})` : ""}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="h1">Новый тендер</div>
      <div className="muted small">Старт сразу после публикации. Карточка уйдёт в чат участников.</div>

      <Card>
        <label htmlFor="city">Город</label>
        <input id="city" value={city} placeholder="Подольск" onChange={(e) => setCity(e.target.value)} />

        <label htmlFor="net">Сеть</label>
        <select id="net" value={network} onChange={(e) => setNetwork(e.target.value as "magnit" | "pyaterochka")}>
          <option value="magnit">Магнит</option>
          <option value="pyaterochka">Пятёрочка</option>
        </select>

        <label htmlFor="qty">Количество, шт (8 400 – 25 200)</label>
        <input id="qty" inputMode="numeric" value={quantity} className={qtyError ? "invalid" : ""}
          onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))} />
        {qtyError && quantity !== "" && <div className="field-error">{qtyError}</div>}

        <label htmlFor="price">Начальная цена, ₽/шт</label>
        <input id="price" inputMode="decimal" placeholder="20,50" value={price} className={priceError && price !== "" ? "invalid" : ""}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))} />
        {priceError && price !== "" && <div className="field-error">{priceError}</div>}

        <label htmlFor="dur">Длительность</label>
        <select id="dur" value={duration} onChange={(e) => setDuration(e.target.value)}>
          <option value="24">24 часа</option>
          <option value="48">48 часов</option>
        </select>
      </Card>

      <Card>
        <div className="h2">Фотографии ({media.length} из 5)</div>
        <div className="stack">
          {media.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <img src={m.previewUrl} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />
              <button className="ghost" onClick={() => setMedia(media.filter((_, k) => k !== i))}>Удалить</button>
            </div>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
        <button className="ghost" style={{ marginTop: 8 }} disabled={media.length >= 5} onClick={() => fileRef.current?.click()}>
          Добавить фото
        </button>
        <div className="hint">Сжимаем до 2000 px по длинной стороне прямо на телефоне; превью 800 px делает сервер.</div>
      </Card>

      {error && <Banner kind="error">{error}</Banner>}
      <button className="bid" disabled={busy} onClick={() => void publish()}>
        {busy ? "Публикуем…" : "Опубликовать"}
      </button>
      <button className="ghost" disabled={busy} onClick={onBack}>Отмена</button>
      <div className="hint center">Публикация доступна только организатору (проверяется на сервере).</div>
    </div>
  );
}
