import { type DiscordSettings, JAPANESE_CLIMBING_LEVELS, V_CLIMBING_LEVELS } from "@pinto/shared";
import { Check, ExternalLink, Link2Off, Moon, Send, Sun, Trash2, UserRound } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { GYM_PINS } from "../../domain/gym-pins";
import { authClient } from "../../infrastructure/api/auth";
import {
  type CommunityProfile,
  getMyCommunityProfile,
  saveMyCommunityProfile,
} from "../../infrastructure/api/community";
import { postDiscordTest } from "../../infrastructure/api/discord";
import { getDiscordSettings, saveSetting } from "../../infrastructure/storage/database";
import { GymPinFilterFields, useGymPinFilter } from "../gyms/GymPinFilter";

const emptySettings: DiscordSettings = {
  webhookUrl: "",
  notifyOnCreate: false,
  notifyOnUpdate: false,
};

const emptyProfile: CommunityProfile = {
  handle: null,
  username: "",
  bio: "",
  climbingLevel: "",
  japaneseClimbingLevel: "",
  vClimbingLevel: "",
  homeGym: "",
  homeGyms: [],
  residence: "",
  age: null,
  avatar: null,
  isPrivate: false,
};

async function encodeAvatar(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選択してください。");
  if (file.size > 10 * 1024 * 1024) throw new Error("画像は10MB以下にしてください。");

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を読み込めませんでした。");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const avatar = canvas.toDataURL("image/webp", 0.82);
    if (avatar.length > 200_000) throw new Error("画像のサイズを小さくできませんでした。");
    return avatar;
  } finally {
    bitmap.close();
  }
}

export function SettingsPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [darkAccent, setDarkAccent] = useState<"blue" | "orange">(() =>
    window.localStorage.getItem("pinto-theme-accent") === "orange" ? "orange" : "blue",
  );
  const [darkMode, setDarkMode] = useState(
    () => window.localStorage.getItem("pinto-theme") === "dark",
  );
  const [settings, setSettings] = useState(emptySettings);
  const [profile, setProfile] = useState(emptyProfile);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const gymFilter = useGymPinFilter();

  useEffect(() => {
    void getDiscordSettings().then((stored) => {
      if (stored) setSettings(stored);
    });
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    setProfileLoading(true);
    void getMyCommunityProfile()
      .then((stored) => {
        if (active)
          setProfile({
            ...emptyProfile,
            ...stored,
            homeGyms: stored.homeGyms ?? (stored.homeGym ? [stored.homeGym] : []),
            isPrivate: stored.isPrivate ?? false,
          });
      })
      .catch((reason: unknown) => {
        if (active) {
          setProfileStatus(
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
  }, [session?.user]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileStatus("");
    try {
      const savedProfile = await saveMyCommunityProfile({
        handle: profile.handle ?? "",
        username: profile.username,
        bio: profile.bio,
        climbingLevel: profile.japaneseClimbingLevel || profile.vClimbingLevel,
        japaneseClimbingLevel: profile.japaneseClimbingLevel,
        vClimbingLevel: profile.vClimbingLevel,
        homeGym: profile.homeGyms[0] ?? "",
        homeGyms: profile.homeGyms,
        residence: profile.residence,
        age: profile.age,
        avatar: profile.avatar,
        isPrivate: profile.isPrivate,
      });
      setProfile(savedProfile);
      setProfileStatus("プロフィールを保存しました。");
    } catch (reason) {
      setProfileStatus(
        reason instanceof Error ? reason.message : "プロフィールを保存できませんでした。",
      );
    } finally {
      setProfileSaving(false);
    }
  }

  function toggleHomeGym(gymName: string, checked: boolean) {
    setProfile((current) => {
      const homeGyms = checked
        ? current.homeGyms.includes(gymName)
          ? current.homeGyms
          : [...current.homeGyms, gymName]
        : current.homeGyms.filter((name) => name !== gymName);
      return { ...current, homeGyms, homeGym: homeGyms[0] ?? "" };
    });
  }

  async function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setProfileStatus("");
    try {
      const avatar = await encodeAvatar(file);
      setProfile((current) => ({ ...current, avatar }));
      setProfileStatus("アイコンを選択しました。プロフィールを保存してください。");
    } catch (reason) {
      setProfileStatus(
        reason instanceof Error ? reason.message : "アイコンを読み込めませんでした。",
      );
    }
  }

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await saveSetting("discord", settings);
    setSaved(true);
    setStatus("設定をこの端末に保存しました");
    window.setTimeout(() => setSaved(false), 1800);
  }

  async function testConnection() {
    if (!settings.webhookUrl) {
      setStatus("Webhook URLを入力してください");
      return;
    }
    setBusy(true);
    setStatus("Discordに接続しています...");
    try {
      const message = await postDiscordTest(settings.webhookUrl);
      await saveSetting("discord", settings);
      setStatus(message);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "接続テストに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    const cleared = { ...emptySettings };
    setSettings(cleared);
    await saveSetting("discord", cleared);
    setStatus("Webhook URLを削除しました");
  }

  function update<K extends keyof DiscordSettings>(key: K, value: DiscordSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateTheme(enabled: boolean) {
    setDarkMode(enabled);
    const theme = enabled ? "dark" : "light";
    window.localStorage.setItem("pinto-theme", theme);
    document.documentElement.dataset.theme = theme;
  }

  function updateDarkAccent(accent: "blue" | "orange") {
    setDarkAccent(accent);
    window.localStorage.setItem("pinto-theme-accent", accent);
    document.documentElement.dataset.accent = accent;
  }

  return (
    <main className="page-shell settings-page">
      <div className="settings-heading">
        <p className="eyebrow">PREFERENCES</p>
        <h1 className="display-title">Settings</h1>
        <p className="intro-copy">共有先と通知を設定します。設定はこの端末に保存されます。</p>
      </div>
      <section className="settings-section" aria-labelledby="appearance-heading">
        <div className="section-label">
          <span>APPEARANCE</span>
          <span>01</span>
        </div>
        <div className="settings-block">
          <h2 className="appearance-heading" id="appearance-heading">
            表示テーマ
          </h2>
          <label className="toggle-row appearance-toggle">
            <span className="appearance-toggle__label">
              {darkMode ? (
                <Moon size={17} aria-hidden="true" />
              ) : (
                <Sun size={17} aria-hidden="true" />
              )}
              <span>
                <strong>ダークモード</strong>
                <small>この端末の表示に適用します。</small>
              </span>
            </span>
            <input
              type="checkbox"
              checked={darkMode}
              onChange={(event) => updateTheme(event.currentTarget.checked)}
              aria-label="ダークモード"
            />
          </label>
          <fieldset className="appearance-colors">
            <legend>ダークモードのアクセントカラー</legend>
            <label className="appearance-color-option">
              <input
                type="radio"
                name="dark-accent"
                value="blue"
                checked={darkAccent === "blue"}
                onChange={() => updateDarkAccent("blue")}
              />
              <span className="appearance-color-swatch appearance-color-swatch--blue" />
              <span>ブルー</span>
            </label>
            <label className="appearance-color-option">
              <input
                type="radio"
                name="dark-accent"
                value="orange"
                checked={darkAccent === "orange"}
                onChange={() => updateDarkAccent("orange")}
              />
              <span className="appearance-color-swatch appearance-color-swatch--orange" />
              <span>オレンジ</span>
            </label>
          </fieldset>
        </div>
      </section>
      <form className="settings-section" onSubmit={(event) => void saveProfile(event)}>
        <div className="section-label">
          <span>COMMUNITY PROFILE</span>
          <span>02</span>
        </div>
        {sessionPending ? (
          <p className="settings-block">アカウントを確認しています...</p>
        ) : !session?.user ? (
          <p className="settings-block">Googleログインするとプロフィールを設定できます。</p>
        ) : (
          <div className="settings-block">
            <div className="profile-fields">
              <div className="profile-avatar-field profile-field--wide">
                <span className="profile-avatar-preview">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="プロフィールアイコン" />
                  ) : (
                    <UserRound size={26} aria-hidden="true" />
                  )}
                </span>
                <div className="profile-avatar-controls">
                  <label className="field-label" htmlFor="profile-avatar">
                    プロフィールアイコン
                  </label>
                  <input
                    id="profile-avatar"
                    className="file-input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => void selectAvatar(event)}
                  />
                  <span className="field-hint">画像は256pxに縮小して保存します。</span>
                </div>
                {profile.avatar && (
                  <button
                    className="button button--quiet danger-text profile-avatar-remove"
                    type="button"
                    title="アイコンを削除"
                    aria-label="アイコンを削除"
                    onClick={() => setProfile((current) => ({ ...current, avatar: null }))}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <label className="field-label" htmlFor="profile-username">
                ユーザー名
                <input
                  id="profile-username"
                  className="text-input"
                  autoComplete="nickname"
                  minLength={1}
                  maxLength={32}
                  value={profile.username}
                  onChange={(event) => {
                    const username = event.currentTarget.value;
                    setProfile((current) => ({ ...current, username }));
                  }}
                  placeholder="表示する名前"
                  required
                />
                <span className="field-hint">他のユーザーと同じ名前も設定できます。</span>
              </label>
              <label className="field-label" htmlFor="profile-handle">
                ユーザーID
                <input
                  id="profile-handle"
                  className="text-input"
                  autoComplete="username"
                  minLength={3}
                  maxLength={24}
                  pattern="[a-zA-Z0-9_]+"
                  value={profile.handle ?? ""}
                  onChange={(event) => {
                    const handle = event.currentTarget.value;
                    setProfile((current) => ({ ...current, handle }));
                  }}
                  placeholder="例: climber_01"
                  required
                />
                <span className="field-hint">英小文字・数字・_、3〜24文字。</span>
              </label>
              <label className="field-label" htmlFor="profile-level-japanese">
                日本式グレード
                <select
                  id="profile-level-japanese"
                  className="text-input"
                  value={profile.japaneseClimbingLevel}
                  onChange={(event) => {
                    const japaneseClimbingLevel = event.currentTarget.value;
                    setProfile((current) => ({
                      ...current,
                      japaneseClimbingLevel,
                      climbingLevel: japaneseClimbingLevel || current.vClimbingLevel,
                    }));
                  }}
                >
                  <option value="">未設定</option>
                  {JAPANESE_CLIMBING_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label" htmlFor="profile-level-v">
                Vグレード
                <select
                  id="profile-level-v"
                  className="text-input"
                  value={profile.vClimbingLevel}
                  onChange={(event) => {
                    const vClimbingLevel = event.currentTarget.value;
                    setProfile((current) => ({
                      ...current,
                      vClimbingLevel,
                      climbingLevel: current.japaneseClimbingLevel || vClimbingLevel,
                    }));
                  }}
                >
                  <option value="">未設定</option>
                  {V_CLIMBING_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label" htmlFor="profile-residence">
                住み
                <input
                  id="profile-residence"
                  className="text-input"
                  maxLength={100}
                  value={profile.residence}
                  onChange={(event) => {
                    const residence = event.currentTarget.value;
                    setProfile((current) => ({ ...current, residence }));
                  }}
                  placeholder="例: 大阪市"
                />
                <span className="field-hint">
                  任意。市区町村など公開してよい範囲で入力してください。
                </span>
              </label>
              <label className="field-label" htmlFor="profile-age">
                年齢 <span className="field-hint inline">任意</span>
                <input
                  id="profile-age"
                  className="text-input"
                  type="number"
                  min="1"
                  max="120"
                  value={profile.age ?? ""}
                  onChange={(event) => {
                    const age =
                      event.currentTarget.value === "" ? null : event.currentTarget.valueAsNumber;
                    setProfile((current) => ({ ...current, age }));
                  }}
                  placeholder="年齢"
                />
              </label>
              <fieldset className="field-label profile-field--wide profile-home-gyms">
                <legend>
                  よく行くジム <span className="field-hint inline">任意・複数選択可</span>
                </legend>
                <GymPinFilterFields
                  prefectureCode={gymFilter.prefectureCode}
                  onPrefectureChange={gymFilter.setPrefectureCode}
                  query={gymFilter.query}
                  onQueryChange={gymFilter.setQuery}
                  filtersApplied={gymFilter.filtersApplied}
                  resultCount={gymFilter.filteredGyms.length}
                />
                <div className="profile-home-gyms__options">
                  {profile.homeGyms.map((gymName) => (
                    <label className="profile-home-gyms__option" key={`selected:${gymName}`}>
                      <input
                        type="checkbox"
                        checked={profile.homeGyms.includes(gymName)}
                        onChange={(event) => toggleHomeGym(gymName, event.currentTarget.checked)}
                      />
                      <span>
                        {GYM_PINS.some((gym) => gym.name === gymName)
                          ? gymName
                          : `登録外: ${gymName}`}
                      </span>
                    </label>
                  ))}
                  {gymFilter.filteredGyms
                    .filter((gym) => !profile.homeGyms.includes(gym.name))
                    .map((gym) => (
                      <label className="profile-home-gyms__option" key={gym.id}>
                        <input
                          type="checkbox"
                          checked={profile.homeGyms.includes(gym.name)}
                          onChange={(event) => {
                            toggleHomeGym(gym.name, event.currentTarget.checked);
                          }}
                        />
                        <span>{gym.name}</span>
                      </label>
                    ))}
                </div>
              </fieldset>
              <label className="field-label profile-field--wide" htmlFor="profile-bio">
                自己紹介
                <textarea
                  id="profile-bio"
                  className="text-input profile-bio"
                  maxLength={240}
                  value={profile.bio}
                  onChange={(event) => {
                    const bio = event.currentTarget.value;
                    setProfile((current) => ({ ...current, bio }));
                  }}
                  placeholder="クライミングのことなど"
                />
              </label>
              <label className="toggle-row profile-field--wide">
                <span>
                  <strong>プロフィールを非公開にする</strong>
                  <small>投稿はフォロワーだけが見られます。</small>
                </span>
                <input
                  type="checkbox"
                  checked={profile.isPrivate}
                  onChange={(event) => {
                    const isPrivate = event.currentTarget.checked;
                    setProfile((current) => ({ ...current, isPrivate }));
                  }}
                />
              </label>
            </div>
            {profileStatus && (
              <p className="settings-status" role="status">
                {profileStatus}
              </p>
            )}
            <div className="settings-actions">
              <span className="field-hint">
                {profileLoading
                  ? "読み込み中..."
                  : profile.username
                    ? `${profile.username}${profile.handle ? ` (@${profile.handle})` : ""}`
                    : "未設定"}
              </span>
              <button
                className="button button--primary"
                type="submit"
                disabled={profileSaving || profileLoading}
              >
                <Check size={16} /> {profileSaving ? "保存中..." : "プロフィールを保存"}
              </button>
            </div>
          </div>
        )}
      </form>
      <form className="settings-section" onSubmit={save}>
        <div className="section-label">
          <span>INTEGRATIONS</span>
          <span>03</span>
        </div>
        <div className="settings-block">
          <div className="settings-block__heading">
            <div className="integration-mark">D</div>
            <div>
              <h2>Discord</h2>
              <p>Incoming Webhookでルート画像を共有</p>
            </div>
            <span className={`connection-pill ${settings.webhookUrl ? "is-configured" : ""}`}>
              <span />
              {settings.webhookUrl ? "設定済み" : "未接続"}
            </span>
          </div>
          <label className="field-label" htmlFor="discord-webhook">
            Webhook URL
          </label>
          <div className="webhook-row">
            <input
              id="discord-webhook"
              className="text-input"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={settings.webhookUrl}
              onChange={(event) => update("webhookUrl", event.currentTarget.value)}
              placeholder="https://discord.com/api/webhooks/..."
            />
            <button
              className="button button--outline"
              type="button"
              disabled={busy || !settings.webhookUrl}
              onClick={() => void testConnection()}
            >
              <Send size={15} /> 接続テスト
            </button>
          </div>
          <p className="field-hint">
            URLはIndexedDBにローカル保存し、画面ではマスク表示します。外部へ保存されません。
          </p>
          <div className="notification-options">
            <label className="toggle-row">
              <span>
                <strong>ルート作成を通知</strong>
                <small>新しいルートを作ったとき</small>
              </span>
              <input
                type="checkbox"
                checked={settings.notifyOnCreate}
                onChange={(event) => update("notifyOnCreate", event.currentTarget.checked)}
              />
            </label>
            <label className="toggle-row">
              <span>
                <strong>ルート更新を通知</strong>
                <small>ルートのホールドや情報を変更したとき</small>
              </span>
              <input
                type="checkbox"
                checked={settings.notifyOnUpdate}
                onChange={(event) => update("notifyOnUpdate", event.currentTarget.checked)}
              />
            </label>
          </div>
          {status && (
            <p className="settings-status" role="status">
              {status}
            </p>
          )}
          <div className="settings-actions">
            <a
              className="text-link"
              href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
              target="_blank"
              rel="noreferrer"
            >
              Webhookについて <ExternalLink size={13} />
            </a>
            <div className="settings-actions__right">
              {settings.webhookUrl && (
                <button
                  className="button button--quiet danger-text"
                  type="button"
                  onClick={() => void disconnect()}
                >
                  <Link2Off size={15} /> 解除
                </button>
              )}
              <button className="button button--primary" type="submit">
                {saved ? <Check size={16} /> : null}
                {saved ? "保存しました" : "設定を保存"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
