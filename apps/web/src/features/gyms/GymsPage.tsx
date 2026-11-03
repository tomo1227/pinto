import {
  JAPAN_PREFECTURES,
  JAPAN_REGIONS,
  type JapanPrefecture,
  type JapanRegion,
} from "@pinto/shared";
import { Link } from "@tanstack/react-router";
import { MapPin, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { getGymPinsByPrefecture } from "../../domain/gym-pins";
import { submitGymRegistrationRequest } from "../../infrastructure/api/gym-requests";

const defaultPrefecture: JapanPrefecture = {
  code: "JP-27",
  name: "大阪府",
  region: "関西",
  center: [34.69, 135.5],
};

export function GymsPage() {
  const [region, setRegion] = useState<JapanRegion>("関西");
  const [prefectureCode, setPrefectureCode] = useState(defaultPrefecture.code);
  const [selectedGymId, setSelectedGymId] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestAddress, setRequestAddress] = useState("");
  const [requestPhone, setRequestPhone] = useState("");
  const [requestWebsite, setRequestWebsite] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  const prefectures = useMemo(
    () => JAPAN_PREFECTURES.filter((prefecture) => prefecture.region === region),
    [region],
  );
  const prefecture =
    JAPAN_PREFECTURES.find((item) => item.code === prefectureCode) ?? defaultPrefecture;
  const gyms = useMemo(() => getGymPinsByPrefecture(prefectureCode), [prefectureCode]);
  const selectedGym = gyms.find((gym) => gym.id === selectedGymId);
  const searchQuery = selectedGym
    ? `${selectedGym.name} ${prefecture.name}`
    : `クライミングジム ${prefecture.name}`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;

  function changeRegion(nextRegion: JapanRegion) {
    const nextPrefecture = JAPAN_PREFECTURES.find((item) => item.region === nextRegion);
    setRegion(nextRegion);
    if (nextPrefecture) {
      setPrefectureCode(nextPrefecture.code);
      setSelectedGymId("");
    }
  }

  function changePrefecture(nextCode: string) {
    const nextPrefecture = JAPAN_PREFECTURES.find((item) => item.code === nextCode);
    if (!nextPrefecture) return;
    setRegion(nextPrefecture.region);
    setPrefectureCode(nextPrefecture.code);
    setSelectedGymId("");
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestSubmitting(true);
    setRequestError("");
    try {
      await submitGymRegistrationRequest({
        prefectureCode,
        gymName: requestName,
        address: requestAddress,
        phone: requestPhone,
        website: requestWebsite,
        message: requestMessage,
      });
      setRequestSubmitted(true);
    } catch (reason) {
      setRequestError(reason instanceof Error ? reason.message : "申請に失敗しました。");
    } finally {
      setRequestSubmitting(false);
    }
  }

  return (
    <main className="page-shell gym-directory-page">
      <header className="gym-directory-heading">
        <div>
          <p className="eyebrow">JAPAN CLIMBING GYMS</p>
          <h1 className="display-title">Gyms</h1>
          <p className="intro-copy">地域からクライミングジムを探す。</p>
        </div>
        <div className="gym-directory-heading__actions">
          <Link className="button button--outline button--small" to="/gym-requests">
            申請管理
          </Link>
          <MapPin size={26} aria-hidden="true" />
        </div>
      </header>

      <div className="gym-directory-controls">
        <label className="field-label" htmlFor="gym-region">
          地域
          <select
            id="gym-region"
            className="text-input"
            value={region}
            onChange={(event) => changeRegion(event.currentTarget.value as JapanRegion)}
          >
            {JAPAN_REGIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label" htmlFor="gym-prefecture">
          都道府県
          <select
            id="gym-prefecture"
            className="text-input"
            value={prefectureCode}
            onChange={(event) => changePrefecture(event.currentTarget.value)}
          >
            {prefectures.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label" htmlFor="gym-select">
          ジム
          <select
            id="gym-select"
            className="text-input"
            value={selectedGym?.id ?? ""}
            disabled={gyms.length === 0}
            onChange={(event) => setSelectedGymId(event.currentTarget.value)}
          >
            <option value="">{gyms.length ? "ジムを選択" : "登録ジムなし"}</option>
            {gyms.map((gym) => (
              <option key={gym.id} value={gym.id}>
                {gym.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="gym-directory-results" aria-label={`${prefecture.name}のジム`}>
        <div className="gym-directory-search-result">
          <div className="section-label">{prefecture.name}のジム</div>
          {selectedGym ? (
            <div className="gym-directory-selected">
              <strong>{selectedGym.name}</strong>
              {selectedGym.address && <span>住所: {selectedGym.address}</span>}
              {selectedGym.phone && <span>電話: {selectedGym.phone}</span>}
              {selectedGym.website && (
                <a href={selectedGym.website} target="_blank" rel="noreferrer">
                  公式サイト
                </a>
              )}
            </div>
          ) : (
            <p className="empty-copy">
              {gyms.length ? "ジムを選択してください。" : "この都道府県の登録ジムはありません。"}
            </p>
          )}
          <a
            className="button button--outline button--small"
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin size={16} aria-hidden="true" />
            Google Mapsで検索
          </a>
          {requestSubmitted ? (
            <p className="gym-registration-success" role="status">
              登録申請を受け付けました。内容を確認後、一覧へ反映します。
            </p>
          ) : requestOpen ? (
            <form className="gym-registration-form" onSubmit={submitRequest}>
              <div className="gym-registration-form__heading">
                <strong>{prefecture.name}のジムを登録申請</strong>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="申請フォームを閉じる"
                  onClick={() => setRequestOpen(false)}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <label className="field-label" htmlFor="gym-request-name">
                ジム名
                <input
                  id="gym-request-name"
                  className="text-input"
                  value={requestName}
                  onChange={(event) => setRequestName(event.currentTarget.value)}
                  maxLength={100}
                  required
                />
              </label>
              <div className="gym-registration-form__fields">
                <label className="field-label" htmlFor="gym-request-address">
                  住所（任意）
                  <input
                    id="gym-request-address"
                    className="text-input"
                    value={requestAddress}
                    onChange={(event) => setRequestAddress(event.currentTarget.value)}
                    maxLength={200}
                  />
                </label>
                <label className="field-label" htmlFor="gym-request-phone">
                  電話番号（任意）
                  <input
                    id="gym-request-phone"
                    className="text-input"
                    type="tel"
                    value={requestPhone}
                    onChange={(event) => setRequestPhone(event.currentTarget.value)}
                    maxLength={40}
                  />
                </label>
              </div>
              <label className="field-label" htmlFor="gym-request-website">
                公式サイト（任意）
                <input
                  id="gym-request-website"
                  className="text-input"
                  type="url"
                  value={requestWebsite}
                  onChange={(event) => setRequestWebsite(event.currentTarget.value)}
                  maxLength={300}
                  placeholder="https://"
                />
              </label>
              <label className="field-label" htmlFor="gym-request-message">
                補足（任意）
                <textarea
                  id="gym-request-message"
                  className="text-input"
                  value={requestMessage}
                  onChange={(event) => setRequestMessage(event.currentTarget.value)}
                  maxLength={500}
                  rows={3}
                />
              </label>
              {requestError && (
                <p className="community-status" role="alert">
                  {requestError}
                </p>
              )}
              <button
                className="button button--primary button--small"
                type="submit"
                disabled={requestSubmitting}
              >
                {requestSubmitting ? "送信中..." : "登録申請を送信"}
              </button>
            </form>
          ) : (
            <button
              className="button button--outline button--small"
              type="button"
              onClick={() => {
                setRequestName(selectedGym?.name ?? "");
                setRequestSubmitted(false);
                setRequestOpen(true);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              ジムの登録を申請
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
