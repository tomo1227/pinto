# Pinto

クライミングウォールの写真をもとに、ホールドとルートを作成・管理するローカルファーストのWebアプリです。壁画像、編集内容、設定はブラウザーのIndexedDBに保存されます。Discord連携を使う場合のみ、Webhook送信をローカルのCloudflare Worker経由で行います。

## 必要環境

- Node.js 26以上（`.node-version`に記載）
- pnpm 12.16.1（Corepack利用を推奨）

依存関係をインストールして、WebアプリとWorkerを起動します。

```sh
pnpm install
pnpm dev
```

Webアプリ: `http://localhost:5173`
Worker API: `http://localhost:8787/api/hello`

初回起動時にCloudflare Wranglerのローカル設定で権限エラーが出る環境では、`XDG_CONFIG_HOME=/tmp pnpm dev`を使用してください。Dev Containerでは`.devcontainer/Dockerfile`に設定済みです。

## 主な機能

- 壁画像の登録とライブラリ管理
- Canvas上でのホールド配置、移動、属性編集
- ルート作成、順序・グレード・Setterなどの管理
- Undo/Redo、PNG書き出し
- IndexedDBへのローカル保存とPWA対応
- Discord Webhookの接続テスト、ルートPNG共有、作成・更新通知

## 開発コマンド

```sh
pnpm format       # Biomeでフォーマット
pnpm lint         # Biomeでチェック
pnpm typecheck    # Web / Workerの型チェック
pnpm test         # Vitest
pnpm test:e2e     # Playwright E2E
pnpm build        # Webをビルドし、Workerをローカル検証
```

E2Eテストの初回実行前に、PlaywrightのChromiumをインストールします。

```sh
pnpm --filter @pinto/web exec playwright install chromium
```

ビルド成果物はWorkerの静的アセットとして配信されます。通常の開発・確認ではデプロイは不要です。
