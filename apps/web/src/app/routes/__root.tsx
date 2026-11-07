import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { LogIn, LogOut, Mountain, Settings2, UserRound, Users } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "../../features/workspace/store";
import { authClient } from "../../infrastructure/api/auth";
import {
  type CommunityMember,
  getCommunityConnections,
  getMyCommunityProfile,
  saveMyCommunityProfile,
} from "../../infrastructure/api/community";

type AccountMenuProps = {
  notify: (message: string) => void;
  onSignOut: () => void;
};

function AccountMenu({ notify, onSignOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"followers" | "following">("followers");
  const [profile, setProfile] = useState<CommunityMember | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void getMyCommunityProfile()
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch((reason: unknown) => {
        if (active)
          notify(reason instanceof Error ? reason.message : "プロフィールを読み込めませんでした。");
      });
    return () => {
      active = false;
    };
  }, [open, notify]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    void getCommunityConnections(tab)
      .then((result) => {
        if (active) setMembers(result);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "一覧を読み込めませんでした。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, tab]);

  function close() {
    setOpen(false);
  }

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        className="auth-button account-menu__trigger"
        type="button"
        title="プロフィールとフォロー一覧"
        aria-label="ユーザーメニュー"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
      >
        {profile?.avatar ? (
          <img className="account-menu__trigger-avatar" src={profile.avatar} alt="" />
        ) : (
          <UserRound size={17} />
        )}
      </button>
      {open && (
        <section className="account-menu__panel" aria-label="ユーザーメニュー">
          <div className="account-menu__identity">
            {profile?.avatar ? (
              <img src={profile.avatar} alt="" />
            ) : (
              <UserRound className="account-menu__fallback-icon" size={20} aria-hidden="true" />
            )}
            <div>
              <strong>{profile?.username || "ユーザー名未設定"}</strong>
              <span>{profile?.handle ? `@${profile.handle}` : "ユーザーID未設定"}</span>
            </div>
            <Link
              className="icon-button account-menu__settings"
              to="/settings"
              title="設定"
              aria-label="設定"
              onClick={close}
            >
              <Settings2 size={17} />
            </Link>
            <button
              className="icon-button danger-text account-menu__logout"
              type="button"
              title="ログアウト"
              aria-label="ログアウト"
              onClick={() => {
                close();
                onSignOut();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
          <fieldset className="account-menu__tabs" aria-label="フォロー関係">
            <button
              type="button"
              className={tab === "followers" ? "is-active" : ""}
              aria-pressed={tab === "followers"}
              onClick={() => setTab("followers")}
            >
              フォロワー <span>{profile?.followerCount ?? 0}</span>
            </button>
            <button
              type="button"
              className={tab === "following" ? "is-active" : ""}
              aria-pressed={tab === "following"}
              onClick={() => setTab("following")}
            >
              フォロー中 <span>{profile?.followingCount ?? 0}</span>
            </button>
          </fieldset>
          <div className="account-menu__list" aria-live="polite">
            {loading ? (
              <p className="account-menu__empty">読み込み中...</p>
            ) : error ? (
              <p className="account-menu__empty" role="alert">
                {error}
              </p>
            ) : members.length ? (
              members.map((member) => {
                const homeGyms = member.homeGyms.length
                  ? member.homeGyms.join("・")
                  : member.homeGym;
                const content = (
                  <>
                    {member.avatar ? (
                      <img src={member.avatar} alt="" />
                    ) : (
                      <UserRound
                        className="account-menu__avatar-fallback"
                        size={17}
                        aria-hidden="true"
                      />
                    )}
                    <span className="account-menu__member-name">
                      <strong>{member.username || "ユーザー名未設定"}</strong>
                      <small>
                        {member.handle ? `@${member.handle}` : "ユーザーID未設定"}
                        {homeGyms ? ` · ${homeGyms}` : ""}
                      </small>
                    </span>
                    <Users size={14} aria-hidden="true" />
                  </>
                );
                return member.handle ? (
                  <Link
                    className="account-menu__member"
                    key={member.handle}
                    to="/community/$handle"
                    params={{ handle: member.handle }}
                    onClick={close}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="account-menu__member" key={member.id}>
                    {content}
                  </div>
                );
              })
            ) : (
              <p className="account-menu__empty">
                {tab === "followers"
                  ? "フォロワーはまだいません。"
                  : "まだ誰もフォローしていません。"}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function RootLayout() {
  const [headerHidden, setHeaderHidden] = useState(false);
  const [communityProfile, setCommunityProfile] = useState<CommunityMember | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState("");
  const [handleInput, setHandleInput] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [handleError, setHandleError] = useState("");
  const [handleSaving, setHandleSaving] = useState(false);
  const error = useWorkspaceStore((state) => state.error);
  const notify = useWorkspaceStore((state) => state.notify);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const userId = session?.user.id;

  useEffect(() => {
    let previousScrollY = window.scrollY;
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY <= 0) {
        setHeaderHidden(false);
      } else if (currentScrollY !== previousScrollY) {
        setHeaderHidden(currentScrollY > previousScrollY);
      }
      previousScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (sessionPending) return;
    if (!userId) {
      setCommunityProfile(null);
      setProfileLoading(false);
      setProfileLoadError("");
      return;
    }

    let active = true;
    setProfileLoading(true);
    setProfileLoadError("");
    void getMyCommunityProfile()
      .then((profile) => {
        if (!active) return;
        setCommunityProfile(profile);
        setHandleInput(profile.handle ?? "");
        setUsernameInput(profile.username ?? "");
      })
      .catch((reason: unknown) => {
        if (active) {
          setProfileLoadError(
            reason instanceof Error ? reason.message : "プロフィールを読み込めませんでした。",
          );
        }
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, sessionPending]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => notify(null), 4200);
    return () => window.clearTimeout(timer);
  }, [error, notify]);

  async function signInWithGoogle() {
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
      if (result.error) notify(result.error.message ?? "Googleログインに失敗しました。");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Googleログインに失敗しました。");
    }
  }

  async function signOut() {
    try {
      const result = await authClient.signOut();
      if (result.error) notify(result.error.message ?? "ログアウトに失敗しました。");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "ログアウトに失敗しました。");
    }
  }

  async function registerHandle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHandleSaving(true);
    setHandleError("");
    try {
      const profile = await saveMyCommunityProfile({
        handle: handleInput.trim().toLowerCase(),
        username: usernameInput.trim(),
        bio: communityProfile?.bio ?? "",
        climbingLevel:
          communityProfile?.japaneseClimbingLevel ||
          communityProfile?.vClimbingLevel ||
          communityProfile?.climbingLevel ||
          "",
        japaneseClimbingLevel: communityProfile?.japaneseClimbingLevel ?? "",
        vClimbingLevel: communityProfile?.vClimbingLevel ?? "",
        homeGym: communityProfile?.homeGyms[0] ?? communityProfile?.homeGym ?? "",
        homeGyms: communityProfile?.homeGyms ?? [],
        residence: communityProfile?.residence ?? "",
        age: communityProfile?.age ?? null,
        avatar: communityProfile?.avatar ?? null,
        isPrivate: communityProfile?.isPrivate ?? false,
      });
      setCommunityProfile((current) => (current ? { ...current, ...profile } : current));
    } catch (reason) {
      setHandleError(
        reason instanceof Error ? reason.message : "ユーザーIDを登録できませんでした。",
      );
    } finally {
      setHandleSaving(false);
    }
  }

  const showIdentityGate =
    sessionPending ||
    Boolean(
      session?.user &&
        (profileLoading ||
          profileLoadError ||
          !communityProfile?.handle ||
          !communityProfile.username),
    );

  return (
    <div className="app-frame">
      <header className={`app-header${headerHidden ? " app-header--hidden" : ""}`}>
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
          <Link to="/community" activeProps={{ className: "is-active" }}>
            クライマー
          </Link>
          <Link to="/gyms" activeProps={{ className: "is-active" }}>
            ジム
          </Link>
          <Link to="/tools" activeProps={{ className: "is-active" }}>
            ツール
          </Link>
        </nav>
        <div className="header-auth">
          {session?.user ? (
            <AccountMenu notify={notify} onSignOut={() => void signOut()} />
          ) : (
            <button
              className="auth-button auth-button--login"
              type="button"
              title="Googleでログイン"
              aria-label="Googleでログイン"
              disabled={sessionPending}
              onClick={() => void signInWithGoogle()}
            >
              <LogIn size={15} />
              <span>Googleでログイン</span>
            </button>
          )}
        </div>
      </header>
      {showIdentityGate ? (
        <div className="username-gate">
          <section className="username-gate__panel" role="dialog" aria-modal="true">
            {sessionPending || profileLoading ? (
              <p className="empty-copy">ユーザーIDを確認しています...</p>
            ) : profileLoadError ? (
              <>
                <p className="eyebrow">PINTO PROFILE</p>
                <h1>プロフィールを確認できません</h1>
                <p className="inline-error" role="alert">
                  {profileLoadError}
                </p>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => window.location.reload()}
                >
                  再試行
                </button>
              </>
            ) : (
              <form onSubmit={(event) => void registerHandle(event)}>
                <p className="eyebrow">PINTO PROFILE</p>
                <h1>ユーザー名とIDを登録</h1>
                <p className="username-gate__copy">
                  ユーザー名はプロフィールの表示名です。ユーザーIDはプロフィールURLや検索に使います。
                </p>
                <label className="field-label" htmlFor="required-username">
                  ユーザー名
                  <input
                    id="required-username"
                    className="text-input"
                    autoComplete="nickname"
                    minLength={1}
                    maxLength={32}
                    value={usernameInput}
                    onChange={(event) => setUsernameInput(event.currentTarget.value)}
                    placeholder="表示する名前"
                    required
                  />
                </label>
                <label className="field-label" htmlFor="required-user-handle">
                  ユーザーID
                  <input
                    id="required-user-handle"
                    className="text-input"
                    autoComplete="username"
                    minLength={3}
                    maxLength={24}
                    pattern="[a-zA-Z0-9_]+"
                    value={handleInput}
                    onChange={(event) => setHandleInput(event.currentTarget.value)}
                    placeholder="例: climber_01"
                    required
                  />
                </label>
                <p className="field-hint">
                  英小文字・数字・_、3〜24文字。後から設定画面で変更できます。
                </p>
                {handleError && (
                  <p className="settings-status" role="alert">
                    {handleError}
                  </p>
                )}
                <button
                  className="button button--primary username-gate__submit"
                  type="submit"
                  disabled={handleSaving}
                >
                  {handleSaving ? "登録中..." : "登録して続ける"}
                </button>
              </form>
            )}
          </section>
        </div>
      ) : (
        <Outlet />
      )}
      <footer className="site-footer">
        <span>© 2026 Tomoki Ota</span>
        <nav aria-label="サイト情報">
          <Link to="/privacy">プライバシーポリシー</Link>
          <Link to="/terms">利用規約</Link>
        </nav>
      </footer>
      {error && (
        <div className="toast-message" role="status">
          {error}
        </div>
      )}
    </div>
  );
}

export const Route = createRootRoute({ component: RootLayout });
