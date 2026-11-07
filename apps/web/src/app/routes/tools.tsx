import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Activity, ArrowRight, Wrench } from "lucide-react";

export const Route = createFileRoute("/tools")({ component: ToolsPage });

function ToolsPage() {
  const isCruxRoute = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/tools/crux"),
  });

  if (isCruxRoute) return <Outlet />;

  return (
    <main className="page-shell tools-page">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">CLIMBING TOOLS</p>
          <h1 className="display-title">Tools</h1>
          <p className="intro-copy">クライミングに役立つツール。</p>
        </div>
      </header>
      <section className="tools-grid" aria-label="クライミングツール">
        <Link className="tools-card" to="/tools/crux">
          <div className="tools-card__icon">
            <Activity size={23} aria-hidden="true" />
          </div>
          <div className="tools-card__body">
            <p className="eyebrow">VIDEO ANALYSIS</p>
            <h2>Crux</h2>
            <p>登攀動画の2D姿勢解析、スロー再生、動画比較。</p>
            <span className="tools-card__badge">
              <Wrench size={12} aria-hidden="true" />
              LiDAR不要
            </span>
          </div>
          <ArrowRight className="tools-card__arrow" size={19} aria-hidden="true" />
        </Link>
        <p className="tools-grid__note">ほかのクライミングツールも今後追加予定です。</p>
      </section>
    </main>
  );
}
