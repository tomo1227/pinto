import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MapPin, UserPlus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { WallFeed } from "../../features/walls/DashboardPage";
import { authClient } from "../../infrastructure/api/auth";
import {
  getPublicCommunityProfile,
  type PublicCommunityProfile,
  setCommunityFollow,
} from "../../infrastructure/api/community";

export const Route = createFileRoute("/community/$handle")({ component: MemberProfilePage });

function MemberProfilePage() {
  const { handle } = Route.useParams();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [profile, setProfile] = useState<PublicCommunityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isFollowing = profile?.isFollowing === 1;

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getPublicCommunityProfile(handle)
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "プロフィールを読み込めませんでした。",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [handle]);

  async function toggleFollow() {
    if (!profile) return;
    const following = !isFollowing;
    setBusy(true);
    setError("");
    try {
      await setCommunityFollow(profile.handle ?? handle, following);
      setProfile((current) =>
        current
          ? {
              ...current,
              isFollowing: following ? 1 : 0,
              followerCount: current.followerCount + (following ? 1 : -1),
            }
          : current,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "フォローを更新できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell member-profile-page">
      <Link className="text-link member-profile-back" to="/community">
        <ArrowLeft size={15} /> コミュニティ
      </Link>
      {loading ? (
        <p className="empty-copy">読み込み中...</p>
      ) : !profile ? (
        <p className="inline-error" role="alert">
          {error || "プロフィールが見つかりません。"}
        </p>
      ) : (
        <>
          <header className="member-profile-heading">
            {profile.avatar ? (
              <img className="member-profile-avatar" src={profile.avatar} alt="" />
            ) : (
              <span className="member-profile-avatar member-profile-avatar--fallback">
                <UserRound size={30} aria-hidden="true" />
              </span>
            )}
            <div className="member-profile-identity">
              <h1 className="display-title">{profile.username}</h1>
              <p className="member-profile-handle">@{profile.handle}</p>
              {profile.bio && <p className="member-profile-bio">{profile.bio}</p>}
            </div>
            <section className="member-profile-stats" aria-label="フォロー数">
              <div>
                <strong>{profile.followerCount.toLocaleString("ja-JP")}</strong>
                <span>フォロワー</span>
              </div>
              <div>
                <strong>{profile.followingCount.toLocaleString("ja-JP")}</strong>
                <span>フォロー中</span>
              </div>
            </section>
            {profile.isSelf !== 1 && (
              <div className="member-profile-action">
                {session?.user ? (
                  <button
                    className={isFollowing ? "button button--outline" : "button button--primary"}
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleFollow()}
                  >
                    <UserPlus size={16} />
                    {busy
                      ? "更新中..."
                      : isFollowing
                        ? "フォロー済み"
                        : profile.isFollowedBy
                          ? "フォローバック"
                          : "フォロー"}
                  </button>
                ) : !sessionPending ? (
                  <span className="field-hint">ログインするとフォローできます。</span>
                ) : null}
              </div>
            )}
          </header>

          {error && (
            <p className="community-status" role="alert">
              {error}
            </p>
          )}

          <section className="member-profile-details" aria-label="プロフィール">
            {profile.japaneseClimbingLevel && (
              <div>
                <strong>日本式グレード</strong>
                <span>{profile.japaneseClimbingLevel}</span>
              </div>
            )}
            {profile.vClimbingLevel && (
              <div>
                <strong>Vグレード</strong>
                <span>{profile.vClimbingLevel}</span>
              </div>
            )}
            {profile.residence && (
              <div>
                <strong>住み</strong>
                <span>{profile.residence}</span>
              </div>
            )}
            {profile.age !== null && (
              <div>
                <strong>年齢</strong>
                <span>{profile.age}歳</span>
              </div>
            )}
            {profile.homeGyms.length > 0 && (
              <div>
                <strong>
                  <MapPin size={14} /> よく行くジム
                </strong>
                <span>{profile.homeGyms.join("・")}</span>
              </div>
            )}
          </section>
          <WallFeed authorHandle={profile.handle ?? handle} />
        </>
      )}
    </main>
  );
}
