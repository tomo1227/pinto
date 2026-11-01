import type { DiscordSettings } from "@pinto/shared";
import { Check, ExternalLink, Link2Off, Send } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { postDiscordTest } from "../../infrastructure/api/discord";
import { getDiscordSettings, saveSetting } from "../../infrastructure/storage/database";

const emptySettings: DiscordSettings = {
  webhookUrl: "",
  notifyOnCreate: false,
  notifyOnUpdate: false,
};

export function SettingsPage() {
  const [settings, setSettings] = useState(emptySettings);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getDiscordSettings().then((stored) => {
      if (stored) setSettings(stored);
    });
  }, []);

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

  return (
    <main className="page-shell settings-page">
      <div className="settings-heading">
        <p className="eyebrow">PREFERENCES</p>
        <h1 className="display-title">Settings</h1>
        <p className="intro-copy">共有先と通知を設定します。設定はこの端末に保存されます。</p>
      </div>
      <form className="settings-section" onSubmit={save}>
        <div className="section-label">
          <span>INTEGRATIONS</span>
          <span>01</span>
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
