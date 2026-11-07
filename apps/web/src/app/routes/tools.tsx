import { createFileRoute } from "@tanstack/react-router";
import { Wrench } from "lucide-react";

export const Route = createFileRoute("/tools")({ component: ToolsPage });

function ToolsPage() {
  return (
    <main className="page-shell tools-page">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">CLIMBING TOOLS</p>
          <h1 className="display-title">Tools</h1>
          <p className="intro-copy">クライミングに役立つツール。</p>
        </div>
      </header>
      <section className="empty-state" aria-labelledby="tools-coming-soon">
        <div className="empty-state__mark">
          <Wrench size={24} aria-hidden="true" />
        </div>
        <div>
          <h2 id="tools-coming-soon">ツールは準備中です</h2>
          <p>ここに便利なツールを追加していきます。</p>
        </div>
      </section>
    </main>
  );
}
