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

## 認証とコミュニティ

Google OAuthとコミュニティ投稿を使う場合は、Worker用のローカル設定を作成します。

```sh
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
openssl rand -base64 32
```

生成した値を`BETTER_AUTH_SECRET`に設定し、Google Cloud ConsoleでOAuthクライアントを作成して`GOOGLE_CLIENT_ID`と`GOOGLE_CLIENT_SECRET`を設定します。ローカルの承認済みリダイレクトURIは`http://localhost:5173/api/auth/callback/google`です。

D1は開発用と本番用で分けます。開発時は`wrangler.jsonc`の既定設定を使い、`database_id`は変更しません。WranglerのローカルD1はこの設定をもとにローカル保存領域を識別するため、本番IDを既定設定に入れると開発用DBが別領域になります。

```sh
pnpm --filter @pinto/worker exec wrangler d1 create pinto-db
pnpm --filter @pinto/worker exec wrangler d1 migrations apply pinto-db --local
```

本番D1を作成し、表示されたIDを`apps/worker/wrangler.jsonc`の`env.production.d1_databases[0].database_id`に設定します。`database_name`も作成したD1名に合わせます。`pnpm deploy`は本番環境へデプロイします。

ジム申請の管理者は、ローカルでは`apps/worker/.dev.vars`の`GYM_ADMIN_EMAILS`にGoogleログインのメールアドレスを設定します。複数人はカンマ区切りです。本番では同じ名前のWorker secretを登録してください。ジム一覧の「申請管理」で内容を確認し、GitHub上のジム一覧に手動で追加した後、申請を削除します。

```sh
pnpm --filter @pinto/worker exec wrangler d1 create pinto-db-production
pnpm --filter @pinto/worker exec wrangler d1 migrations apply pinto-db-production --env production --remote
```

本番では、Google OAuthの承認済みリダイレクトURIを`https://<アプリのドメイン>/api/auth/callback/google`に設定し、`BETTER_AUTH_URL`をアプリのoriginにします。`BETTER_AUTH_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`は`--env production`を付けてWrangler secretsに登録し、リモートDBにもマイグレーションを適用してください。

## 主な機能

- 壁画像の登録とライブラリ管理
- Canvas上でのホールド配置、移動、属性編集
- ルート作成、順序・グレード・Setterなどの管理
- Undo/Redo、PNG書き出し
- IndexedDBへのローカル保存とPWA対応
- Google OAuthログインとD1コミュニティ投稿
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
