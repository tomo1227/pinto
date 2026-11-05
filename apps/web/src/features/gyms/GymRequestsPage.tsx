import { JAPAN_PREFECTURES } from "@pinto/shared";
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  deleteGymRegistrationRequest,
  type GymRegistrationRequest,
  getGymRegistrationRequests,
} from "../../infrastructure/api/gym-requests";

export function GymRequestsPage() {
  const [requests, setRequests] = useState<GymRegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [savingId, setSavingId] = useState("");

  useEffect(() => {
    let active = true;
    void getGymRegistrationRequests()
      .then((result) => {
        if (active) setRequests(result);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "申請一覧を読み込めませんでした。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function removeRequest(request: GymRegistrationRequest) {
    if (!window.confirm(`${request.gymName}の申請を削除しますか？`)) return;
    setSavingId(request.id);
    setError("");
    setStatus("");
    try {
      await deleteGymRegistrationRequest(request.id);
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setStatus(`${request.gymName}の申請を削除しました。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "申請を更新できませんでした。");
    } finally {
      setSavingId("");
    }
  }

  return (
    <main className="page-shell gym-directory-page">
      <header className="gym-directory-heading">
        <div>
          <p className="eyebrow">GYM DIRECTORY</p>
          <h1 className="display-title">申請管理</h1>
          <p className="intro-copy">GitHubのジム一覧に追加した後、申請を削除できます。</p>
        </div>
        <Link className="button button--outline button--small" to="/gyms">
          ジム一覧へ戻る
        </Link>
      </header>

      <section className="gym-requests-list" aria-label="ジム登録申請">
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {status && (
          <p className="gym-registration-success" role="status">
            {status}
          </p>
        )}
        {loading ? (
          <p className="empty-copy">申請を読み込み中...</p>
        ) : requests.length === 0 ? (
          !error && <p className="empty-copy">申請はありません。</p>
        ) : (
          requests.map((request) => {
            const prefecture = JAPAN_PREFECTURES.find(
              (item) => item.code === request.prefectureCode,
            );
            return (
              <article className="gym-request-row" key={request.id}>
                <div className="gym-request-row__details">
                  <div className="gym-request-row__heading">
                    <h2>{request.gymName}</h2>
                    <span>{prefecture?.name ?? request.prefectureCode}</span>
                  </div>
                  {request.address && <p>{request.address}</p>}
                  {request.phone && <p>{request.phone}</p>}
                  {request.website && (
                    <p>
                      <a href={request.website} target="_blank" rel="noreferrer">
                        公式サイト
                      </a>
                    </p>
                  )}
                  {request.message && <p className="gym-request-row__message">{request.message}</p>}
                  <time dateTime={new Date(request.createdAt).toISOString()}>
                    {new Date(request.createdAt).toLocaleString("ja-JP")}
                  </time>
                </div>
                <div className="gym-request-row__actions">
                  <button
                    className="button button--outline button--small danger-text"
                    type="button"
                    disabled={Boolean(savingId)}
                    onClick={() => void removeRequest(request)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    削除
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
