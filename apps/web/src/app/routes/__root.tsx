import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { CloudOff, Mountain } from "lucide-react";
import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../../features/workspace/store";

function RootLayout() {
  const [online, setOnline] = useState(navigator.onLine);
  const error = useWorkspaceStore((state) => state.error);
  const notify = useWorkspaceStore((state) => state.notify);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => notify(null), 4200);
    return () => window.clearTimeout(timer);
  }, [error, notify]);

  return (
    <div className="app-frame">
      <header className="app-header">
        <Link className="brand-mark" to="/" aria-label="Pinto home">
          <span className="brand-symbol">
            <Mountain size={19} strokeWidth={2.5} />
          </span>
          <span>
            Pinto<span className="brand-period">.</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="メインナビゲーション">
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "is-active" }}>
            壁とルート
          </Link>
          <Link to="/settings" activeProps={{ className: "is-active" }}>
            設定
          </Link>
        </nav>
        <div
          className={`network-indicator ${online ? "is-online" : "is-offline"}`}
          title={online ? "オンライン" : "オフライン"}
        >
          {online ? <span className="network-dot" /> : <CloudOff size={15} />}
          <span>{online ? "LOCAL FIRST" : "OFFLINE"}</span>
        </div>
      </header>
      <Outlet />
      {error && (
        <div className="toast-message" role="status">
          {error}
        </div>
      )}
    </div>
  );
}

export const Route = createRootRoute({ component: RootLayout });
