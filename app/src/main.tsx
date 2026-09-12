import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { ApiError, forceDemo, startSession } from "./api";
import { CreateScreen, ListScreen, TenderScreen } from "./screens";
import { Banner, Skeleton } from "./ui";
import type { Session, TenderCard, TenderListItem } from "./types";

type Route =
  | { name: "list" }
  | { name: "create" }
  | { name: "tender"; code?: string; id?: string };

/** start_param приходит из кнопки «Участвовать»: tender_<код> | create | demo | список. */
export function parseStartParam(sp: string | null): Route {
  if (!sp) return { name: "list" };
  if (sp === "create") return { name: "create" };
  if (sp.startsWith("tender_")) return { name: "tender", code: sp.slice("tender_".length) };
  if (sp === "demo") return { name: "tender", code: "BK-2026-000001" };
  return { name: "list" };
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>({ name: "list" });

  useEffect(() => {
    const w = window.WebApp;
    const query = new URLSearchParams(location.search);
    const startParam: string | null = w?.initDataUnsafe?.start_param ?? query.get("startapp");
    const initData: string = w?.initData ?? "";
    const demoWanted = startParam === "demo" || query.get("demo") === "1";
    if (demoWanted) forceDemo();
    void (async () => {
      try {
        const s = await startSession(initData);
        setSession(s);
        setRoute(parseStartParam(startParam));
      } catch (e) {
        const err = e as ApiError;
        setFatal(
          err.code === "NETWORK"
            ? "Нет связи с API аукциона. Проверьте адрес в config.js и доступность сервера."
            : `${err.message} (${err.code})`,
        );
      }
    })();
  }, []);

  // Кнопка «Назад» мессенджера: из карточки/формы — к списку
  useEffect(() => {
    const bb = window.WebApp?.BackButton;
    if (!bb) return;
    if (route.name === "list") {
      bb.hide?.();
    } else {
      bb.show?.();
      const handler = () => setRoute({ name: "list" });
      bb.onClick?.(handler);
      return () => bb.offClick?.(handler);
    }
  }, [route.name]);

  if (fatal)
    return (
      <div className="wrap">
        <Banner kind="error">{fatal}</Banner>
        <a href="spike.html">Открыть диагностическую страницу Bridge</a>
      </div>
    );

  if (!session)
    return (
      <div className="wrap">
        <Skeleton photo lines={4} />
        <div className="hint center">Проверяем данные запуска из MAX…</div>
      </div>
    );

  if (route.name === "create")
    return <CreateScreen onBack={() => setRoute({ name: "list" })} onCreated={(t: TenderCard) => setRoute({ name: "tender", id: t.id })} />;

  if (route.name === "tender")
    return (
      <TenderScreen
        code={route.code}
        id={route.id}
        session={session}
        onBack={() => setRoute({ name: "list" })}
      />
    );

  return (
    <ListScreen
      session={session}
      onOpen={(t: TenderListItem) => setRoute({ name: "tender", id: t.id })}
      onCreate={() => setRoute({ name: "create" })}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
