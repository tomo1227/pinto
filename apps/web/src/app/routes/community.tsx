import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight, MapPin, Search, UserRound, Users } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { type CommunityMember, getCommunityMembers } from "../../infrastructure/api/community";

export const Route = createFileRoute("/community")({ component: CommunityPage });

function CommunityPage() {
  const isProfileRoute = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/community/$handle"),
  });
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void getCommunityMembers(search)
      .then((result) => {
        if (active) setMembers(result);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "ユーザーを読み込めませんでした。");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(query.trim());
  }

  if (isProfileRoute) return <Outlet />;

  return (
    <main className="page-shell community-page">
      <header className="community-heading">
        <div>
          <p className="eyebrow">PINTO COMMUNITY</p>
          <h1 className="display-title">Climbers</h1>
          <p className="intro-copy">クライマーを探して、つながろう。</p>
        </div>
        <Users size={25} aria-hidden="true" />
      </header>

      <search className="community-search">
        <form onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="community-search">
            ユーザー名・ユーザーIDやジム名で検索
          </label>
          <Search size={17} aria-hidden="true" />
          <input
            id="community-search"
            className="text-input"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="ユーザー名・ユーザーIDやジム名で検索"
            maxLength={40}
          />
          <button className="button button--primary" type="submit">
            検索
          </button>
        </form>
      </search>

      {error && (
        <p className="community-status" role="alert">
          {error}
        </p>
      )}

      <section className="community-directory" aria-label="クライマー">
        <div className="section-label">
          <span>{search ? `SEARCH: ${search}` : "CLIMBERS"}</span>
          <span>{String(members.length).padStart(2, "0")}</span>
        </div>
        {loading ? (
          <p className="empty-copy">読み込み中...</p>
        ) : members.length ? (
          members.map((member) => (
            <article className="community-member" key={member.id}>
              {member.avatar ? (
                <img className="community-avatar" src={member.avatar} alt="" />
              ) : (
                <span className="community-avatar community-avatar--fallback">
                  <UserRound size={17} aria-hidden="true" />
                </span>
              )}
              <div className="community-member__body">
                <Link
                  className="community-member__identity"
                  to="/community/$handle"
                  params={{ handle: member.handle ?? "" }}
                >
                  <strong>{member.username}</strong>
                </Link>
                <div className="community-member__details">
                  {member.japaneseClimbingLevel && <span>{member.japaneseClimbingLevel}</span>}
                  {member.vClimbingLevel && <span>{member.vClimbingLevel}</span>}
                  {member.age !== null && <span>{member.age}歳</span>}
                  {member.residence && <span>{member.residence}</span>}
                  {member.handle && <span>@{member.handle}</span>}
                  {member.homeGyms.length > 0 && (
                    <span>
                      <MapPin size={13} /> {member.homeGyms.join("・")}
                    </span>
                  )}
                  <span>
                    <Users size={13} /> {member.followerCount} フォロワー
                  </span>
                </div>
              </div>
              <Link
                className="icon-button community-member__open"
                to="/community/$handle"
                params={{ handle: member.handle ?? "" }}
                aria-label={`${member.username}のプロフィールを表示`}
              >
                <ArrowUpRight size={17} />
              </Link>
            </article>
          ))
        ) : (
          <p className="empty-copy">
            {search ? "条件に合うユーザーはいません。" : "まだプロフィールがありません。"}
          </p>
        )}
      </section>
    </main>
  );
}
