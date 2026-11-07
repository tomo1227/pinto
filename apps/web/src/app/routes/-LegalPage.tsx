import type { ReactNode } from "react";

type LegalPageProps = {
  title: string;
  children: ReactNode;
};

export function LegalPage({ title, children }: LegalPageProps) {
  return (
    <main className="page-shell legal-page">
      <header className="legal-page__heading">
        <p className="eyebrow">PINTO / INFORMATION</p>
        <h1>{title}</h1>
        <p>制定日: 2026年11月7日</p>
      </header>
      <div className="legal-page__content">{children}</div>
    </main>
  );
}