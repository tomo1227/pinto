# Pinto — Product Requirements & Implementation Specification

あなたはシニアフルスタックエンジニア兼ソフトウェアアーキテクトです。

ボルダリングの壁画像をベースに、ホールドを登録し、ルートを作成・編集・管理・共有できるWebアプリケーション「Pinto」を開発してください。

単なる画像へのポイント描画ツールではなく、将来的にAIによるホールド検出、ルート自動生成、登攀分析などに拡張できるプラットフォームとして設計してください。

既存コードがある場合は、最初にリポジトリ構成、実装済み機能、依存関係、開発・デプロイ環境を確認してください。既存の設計や実装を不必要に破壊せず、この仕様に沿って不足部分を実装・改善してください。

---

# 1. Product Overview

## 1.1 Product Name

Pinto

## 1.2 Product Concept

Pintoは、画像上のポイントとその関係性を管理する汎用的なビジュアル編集プラットフォームです。

最初のユースケースとして、ボルダリングのルート作成・管理を提供します。

ユーザーは壁の写真を登録し、写真上に写っているホールドを選択・登録し、それらを組み合わせてルートを作成できます。

将来的にはAIが壁画像からホールドを検出し、複数のホールドから条件に応じたルートを自動生成できるようにします。

## 1.3 Product Principles

1. **Local-first**: 基本的な編集・データ管理はローカルで完結する。
2. **Domain-driven**: Wall、Hold、Routeなどのドメインモデルを明確に分離する。
3. **Extensible**: 将来のAI機能や他のユースケースを考慮する。
4. **Reusable**: 手動作成とAI生成で同じデータモデル・編集機能を使用する。
5. **Responsive**: デスクトップとモバイルの両方で快適に利用できる。
6. **Simple UX**: 複雑な機能を詰め込みすぎず、直感的に操作できる。

---

# 2. Technology Stack

以下の技術スタックを採用してください。

## Runtime and Package Management

- Runtime: Node.js
- Package Manager: pnpm
- Node.js version: Active LTS versionを使用し、`.node-version` または `.nvmrc` で固定する。
- pnpm version: `packageManager` フィールドで固定する。
- Dependency management: pnpm workspace

Bunは使用しないでください。

すべての依存関係のインストール、スクリプト実行、ビルド、テストにpnpmを使用してください。

## Frontend

- Language: TypeScript
- UI: React
- Build Tool: Vite
- Routing: TanStack Router
- Styling: Tailwind CSS
- State Management: Zustand
- Image Editing: Canvas API
- Data Persistence: IndexedDB
- PWA: Service Worker

TanStack Routerはファイルベースルーティングを採用してください。

## Backend

- Runtime: Cloudflare Workers
- API Framework: Hono
- Hosting: Cloudflare Workers + Static Assets
- Configuration: Wrangler

フロントエンドとAPIは同一リポジトリで管理してください。

Cloudflare WorkersからViteでビルドした静的アセットを配信し、`/api/*` をHonoで処理する構成を基本とします。

## Testing

- Unit Testing: Vitest
- Browser Testing: Playwright

## Architecture

- SPA
- Client-side rendering
- No SSR
- No ISR
- No Server Actions
- No Next.js
- No Next.js-specific architecture
- No HonoX
- No Bun
- No WASM in the initial implementation

Cloudflare WorkersはAPIと静的アセットの配信に使用します。

画像やルートの基本データはIndexedDBに保存し、MVPではサーバー側に永続保存しません。

## Development Commands

以下のようなpnpmスクリプトを用意してください。

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

必要に応じてスクリプト名や実行方法を調整してください。

---

# 3. Monorepo and Project Structure

pnpm workspaceを利用した構成にしてください。

推奨構成：

```text
pinto/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── routes/
│       │   │   ├── providers/
│       │   │   └── router.tsx
│       │   │
│       │   ├── features/
│       │   │   ├── walls/
│       │   │   ├── holds/
│       │   │   ├── routes/
│       │   │   ├── editor/
│       │   │   └── integrations/
│       │   │       └── discord/
│       │   │
│       │   ├── domain/
│       │   │   ├── wall/
│       │   │   ├── hold/
│       │   │   ├── route/
│       │   │   └── shared/
│       │   │
│       │   ├── infrastructure/
│       │   │   ├── storage/
│       │   │   │   └── indexeddb/
│       │   │   ├── api/
│       │   │   └── export/
│       │   │
│       │   └── shared/
│       │       ├── components/
│       │       ├── hooks/
│       │       └── types/
│       │
│       ├── index.html
│       ├── vite.config.ts
│       └── package.json
│
├── apps/
│   └── worker/
│       ├── src/
│       │   ├── index.ts
│       │   ├── routes/
│       │   │   └── discord.ts
│       │   ├── services/
│       │   │   └── discord/
│       │   ├── validators/
│       │   └── middleware/
│       │
│       ├── wrangler.jsonc
│       └── package.json
│
├── packages/
│   └── shared/
│       ├── src/
│       └── package.json
│
├── tests/
│   └── e2e/
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.json
├── biome.json
├── .node-version
└── README.md
```

実際の構成は適切に調整して構いません。

ただし、以下の責務を明確に分離してください。

- React UI
- Domain Model
- Canvas Engine
- IndexedDB Repository
- Backend API
- Shared Types

共有する型やスキーマは `packages/shared` に配置してください。

アプリケーション間の依存関係を明確にし、不要な循環依存を避けてください。

ディレクトリ名には、曖昧な `utils` や `lib` を極力使用せず、責務が分かる名前を付けてください。

---

# 4. Domain Model

将来のAIホールド検出・ルート生成に対応できるよう、Wall、Hold、Routeを独立したエンティティとして設計してください。

## 4.1 Wall

壁そのものを表すエンティティです。

```ts
interface Wall {
  id: string;
  name: string;
  imageId: string;

  width: number;
  height: number;

  physicalDimensions?: {
    width?: number;
    height?: number;
    unit: "cm" | "m";
  };

  inclination?: number;

  createdAt: string;
  updatedAt: string;
}
```

要件：

- 1つのWallに複数のHoldを登録できる。
- 1つのWallに複数のRouteを作成できる。
- 壁画像とホールドデータを独立して管理する。
- 将来的に壁の実寸、傾斜角度、形状などを保持できる。
- 壁画像の差し替えや更新を考慮する。
- Wall自体にHoldやRouteの全データを埋め込まず、IDで関連付ける。

## 4.2 Hold

壁上に存在する個々のホールドを表すエンティティです。

```ts
interface Hold {
  id: string;
  wallId: string;

  position: {
    x: number;
    y: number;
  };

  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  shape?: {
    type: "point" | "polygon" | "ellipse";
    points?: Array<{ x: number; y: number }>;
  };

  type?: string;
  color?: string;

  confidence?: number;

  metadata?: Record<string, unknown>;

  detectionSource: "manual" | "ai";

  createdAt: string;
  updatedAt: string;
}
```

要件：

- 座標は画像サイズに依存しない正規化座標（0〜1）で保存する。
- ホールドごとに一意なIDを持つ。
- 位置だけでなく、将来的にホールドの領域・形状を保存できる。
- 手動登録とAI検出の両方に対応する。
- AI検出時のconfidenceなどの情報を保存できる。
- ホールドの属性は将来追加できる設計にする。

MVPではホールドの中心位置を手動で登録できれば十分です。

形状認識やAIによる検出は実装しないでください。ただし、データモデルを拡張可能にしてください。

## 4.3 Route

ルートを表すエンティティです。

```ts
interface Route {
  id: string;
  wallId: string;

  name: string;
  description?: string;

  holdIds: string[];

  startHoldIds: string[];
  finishHoldIds: string[];

  grade?: string;

  style?: string[];

  author?: string;
  gymName?: string;

  source: "manual" | "ai";

  generationMetadata?: {
    model?: string;
    parameters?: Record<string, unknown>;
    generatedAt?: string;
  };

  createdAt: string;
  updatedAt: string;
}
```

要件：

- RouteはHoldのIDを参照する。
- Holdの実体をRoute内に複製しない。
- 1つのHoldを複数のRouteで再利用できる。
- Start、Normal、Finishの役割を管理する。
- 将来的にAIが生成したRouteも同じモデルで管理する。
- AI生成条件や生成元の情報を保存できる。
- 手動ルートとAIルートを同じエディターで編集できる。
- Routeにおけるホールドの順番は登攀順序を表す。

必要に応じて、将来的に手足の使用区分やムーブ情報を追加できる構造にしてください。

## 4.4 Image Asset

画像データはドメインモデルと分離してください。

```ts
interface ImageAsset {
  id: string;
  blob: Blob;

  mimeType: string;
  width: number;
  height: number;
  size: number;

  createdAt: string;
}
```

画像本体はIndexedDBのBlobとして保存します。

---

# 5. MVP Features

MVPでは、以下の機能を実装してください。

## 5.1 Dashboard

ユーザーが作成したWallを一覧表示します。

機能：

- Wall一覧
- Wallの新規作成
- Wallの編集
- Wallの削除
- Wallのサムネイル表示
- Wallに紐づくRoute数の表示
- 最近更新されたWallの表示

## 5.2 Wall Creation

壁画像を登録できるようにしてください。

機能：

- 画像アップロード
- JPEG / PNG / WebP対応
- 画像プレビュー
- Wall名の入力
- 壁の実寸は任意入力
- 壁の傾斜角度は任意入力

アップロードした画像はIndexedDBに保存してください。

## 5.3 Hold Management

壁画像上にホールドを登録・管理できるようにしてください。

機能：

- 画像をクリック・タップしてHoldを追加
- Holdの選択
- Holdの移動
- Holdの削除
- Holdの一覧表示
- HoldのID管理
- Holdの種類・色などの属性管理

ホールド登録時は、Canvas上に視認性の高いマーカーを表示してください。

ホールドの座標は必ず正規化して保存してください。

画像の解像度や表示サイズが変わっても、ホールドの位置が変わらないようにしてください。

## 5.4 Route Editor

壁画像を背景として、ルートを作成・編集するメイン機能です。

### Route Creation

- ルート名の入力
- グレードの設定
- 説明の入力
- 作成者の設定
- ジム名の設定
- 使用ホールドの選択
- Start / Normal / Finishの設定
- ルートの保存

### Hold Selection

壁上に登録されたホールドを選択し、ルートに追加できるようにしてください。

- ホールドをクリック・タップして選択
- 選択したホールドに番号を表示
- 使用順序を表示
- Start / Normal / Finishを視覚的に区別
- ルートに含まれないホールドは通常表示
- 使用ホールドを一覧表示
- ホールドの選択解除
- 順序の変更

1つのホールドを複数のルートで使用できるようにしてください。

### Route Visualization

ルートのホールドを線で接続してください。

- 使用順序に従って接続線を描画
- ホールドの種類ごとに異なる色を使用
- 番号を表示
- 選択中のルートを強調表示
- 接続線の表示・非表示を切り替え可能

Start / Normal / Finishの色や形状は一貫性のあるデザインにしてください。

### Canvas Interaction

以下の操作に対応してください。

- Zoom In / Zoom Out
- Pan
- Mouse Wheel Zoom
- Pinch Zoom
- Drag
- Click / Tap
- Hold Selection
- Hold Movement

Canvasの表示座標と元画像の座標を正しく変換してください。

### Undo / Redo

以下の操作をUndo / Redoできるようにしてください。

- Holdの追加
- Holdの移動
- Holdの削除
- RouteへのHold追加
- RouteからのHold削除
- Holdの順序変更

Undo / Redoの履歴管理はCanvas描画処理から分離してください。

## 5.5 Route Management

1つのWallに複数のRouteを保存・管理できるようにしてください。

機能：

- Route一覧
- Routeの新規作成
- Routeの編集
- Routeの複製
- Routeの削除
- Routeの詳細表示
- Routeの切り替え
- Routeのグレード表示
- Routeの作成者表示

複数のRouteが同じHoldを参照できるようにしてください。

---

# 6. Canvas Engine

CanvasエンジンはReactコンポーネントから独立したモジュールとして実装してください。

ReactはUIと状態管理を担当し、Canvasエンジンは描画と座標変換、ポインター操作を担当します。

責務：

- Background Image Rendering
- Hold Marker Rendering
- Route Line Rendering
- Hold Number Rendering
- Zoom
- Pan
- Coordinate Transformation
- Hit Testing
- Pointer Interaction

Canvas APIを使用してください。

MVPでは複雑な描画ライブラリを導入せず、Canvas APIを直接使用してください。

Reactの再レンダリングとCanvas描画を適切に分離してください。

Canvasの描画更新は必要な場合のみ実行してください。

画像の元解像度を維持し、拡大時にも正確な位置でホールドを描画できるようにしてください。

---

# 7. Data Persistence

IndexedDBを使用してローカルデータを永続化してください。

保存対象：

- Wall
- Hold
- Route
- ImageAsset
- User Preferences
- Discord Integration Settings

要件：

- アプリの再読み込み後もデータが残る。
- 大きな画像をLocalStorageに保存しない。
- 画像はBlobとして保存する。
- Wall、Hold、Routeの参照関係を維持する。
- データモデルにversionを持たせ、将来のmigrationに対応する。
- 保存処理をUIやCanvasから分離する。
- データの整合性を保つ。

MVPではアカウント登録やクラウド同期を実装しないでください。

---

# 8. Export

ルートを画像としてエクスポートできるようにしてください。

機能：

- PNG Export
- 元画像の解像度を維持
- Hold Markerを描画
- Route Lineを描画
- Hold Numberを描画
- Start / Normal / Finishの表示
- 必要に応じてルート名・グレードを含める

画面表示用Canvasのスクリーンショットではなく、元画像の解像度を基準にエクスポートしてください。

---

# 9. Discord Integration

MVPにDiscord Incoming Webhookによる連携機能を実装してください。

Discord BotやOAuth2はMVPでは実装しません。

## 9.1 Settings

Settings画面にDiscord Integration設定を追加してください。

機能：

- Webhook URL登録
- Webhook URL変更
- 接続テスト
- Webhook解除
- 接続状態表示
- Route作成通知のON/OFF
- Route更新通知のON/OFF

Webhook URLはIndexedDBにローカル保存してください。

画面上ではURLをマスク表示してください。

Webhook URLをログ、分析イベント、エラーメッセージに出力しないでください。

## 9.2 Share Route

Route EditorにDiscord共有ボタンを追加してください。

共有内容：

- Route名
- グレード
- 使用ホールド数
- 作成者（設定されている場合）
- ジム名（設定されている場合）
- ルート画像（PNG）
- 公開Route URL（存在する場合のみ）

Discord Embedを使用して見やすく表示してください。

PNG画像はDiscord Webhookのmultipart/form-dataで送信し、Embedの画像には `attachment://route.png` を指定してください。

公開URLが存在しない場合は、リンクを捏造・表示しないでください。ローカルデータだけのルートでも画像添付によって共有できるようにしてください。

## 9.3 Automatic Notifications

以下のタイミングでDiscord通知を送信できるようにしてください。

- Route作成時
- Route更新時

設定画面でそれぞれON/OFFできるようにしてください。

重複通知を防止してください。

MVPではPintoを開いて操作しているクライアントから通知を送信します。アプリを閉じている間のバックグラウンド通知は対象外です。

## 9.4 Backend API

Honoに以下のAPIを実装してください。

```text
POST /api/integrations/discord/test
POST /api/integrations/discord/share
```

APIの責務：

- Webhook URLの検証
- Discord Webhookへのリクエスト
- PNGファイルの転送
- Discord APIのエラー処理
- レート制限への対応
- 適切なHTTPステータスの返却

Webhook URLはリクエスト時に受け取り、サーバー側に永続保存しないでください。

Webhook URLのホスト名・パス形式を厳密に検証し、任意のURLへのfetchを禁止してください。

`allowed_mentions` を適切に設定し、意図しないメンションを防止してください。

リクエスト本文やWebhook URLをログに記録しないでください。

Discordへの送信に失敗した場合、ユーザーが原因を理解できる安全なエラーを返してください。

---

# 10. Future AI Architecture

このセクションは将来の拡張を考慮するための設計要件です。

MVPでAI機能を実装する必要はありません。

ただし、後から大幅なデータモデル変更をしなくても実装できるようにしてください。

## 10.1 Hold Detection

将来的に壁画像からAIでホールドを検出します。

想定する処理：

1. 壁画像の読み込み
2. ホールド候補の検出
3. ホールド領域の推定
4. ホールド中心座標の推定
5. ホールド属性の推定
6. confidenceの付与
7. 検出結果をHoldとして登録
8. ユーザーによる検出結果の確認・修正

AI検出結果も通常のHoldと同じデータモデルを使用してください。

`detectionSource` でmanual / aiを区別できるようにしてください。

## 10.2 Route Generation

将来的に登録済みの複数のHoldからAIがルートを自動生成します。

想定する入力条件：

- 対象Wall
- 使用可能なHold
- グレード
- ムーブ数
- Start / Finish条件
- 使用するホールドの色・種類
- ルートのスタイル
- 難易度
- その他の制約条件

生成処理の想定：

1. Hold間の関係性を解析
2. 移動可能なHoldの組み合わせを探索
3. 複数のRoute候補を生成
4. 制約条件に基づいて候補を評価
5. 上位候補をユーザーに提示
6. ユーザーが選択・編集・確定

将来的にはHoldをノード、Hold間の移動可能性をエッジとするグラフ表現を採用できるようにしてください。

Hold間の関係には以下の情報を追加できる設計にしてください。

- 距離
- 高低差
- 左右位置関係
- サイズ
- 向き
- 想定リーチ
- 移動可能性

AI生成されたRouteは `source: "ai"` とし、生成条件を `generationMetadata` に保存してください。

AI生成ルートも既存のRoute Editorで編集できるようにしてください。

## 10.3 Route Analysis

将来的に登攀動画とルート情報を組み合わせた分析を行います。

想定機能：

- 実際に使用したHoldの推定
- ルート上のムーブ分析
- 想定ルートと実際の登攀の比較
- 難易度推定
- 重心移動・身体の動きの分析

MVPでは対象外です。

---

# 11. UI / UX Design

シンプルで洗練されたデザインにしてください。

デスクトップでは編集作業がしやすく、モバイルではタッチ操作が快適であることを重視してください。

基本画面：

1. Dashboard
2. Wall Creation
3. Wall Detail
4. Route Editor
5. Settings

Route Editorは以下の構成を基本としてください。

- 中央：壁画像とCanvas
- 左または右：Hold / Routeの一覧・編集パネル
- 上部：編集ツールバー
- 下部またはサイドパネル：選択中のルート情報

ただし、モバイルでは画面幅に応じて適切にレイアウトを変更してください。

視覚的な装飾よりも、画像とホールドを見やすくすることを優先してください。

操作状態が分かりやすいUIにしてください。

---

# 12. PWA

PWAとしてインストールできるようにしてください。

要件：

- Web App Manifest
- Service Worker
- アプリ名とアイコン
- オフラインでの基本操作
- IndexedDBに保存したWall / Hold / Routeの閲覧・編集
- オフライン状態の表示

Discord共有などのネットワーク機能はオンライン時のみ利用可能にしてください。

---

# 13. Testing

VitestとPlaywrightを使用してください。

## Unit Tests

以下をテストしてください。

- 正規化座標の変換
- Canvas座標変換
- Holdの作成・更新・削除
- Routeの作成・更新・削除
- HoldとRouteの参照整合性
- Route内のHold順序
- Undo / Redo
- IndexedDBの保存・読み込み
- データmigration
- PNG Export
- Discord Webhook URL検証

## Integration Tests

- Wall作成からHold登録まで
- Hold登録からRoute作成まで
- 複数RouteでのHold共有
- Route編集と保存
- Routeの複製
- Discord接続テスト
- DiscordへのPNG共有
- Discord APIエラー
- 通知ON/OFF
- 重複通知防止

Discord APIはモックを使用してください。

## E2E Tests

Playwrightで主要なユーザーフローをテストしてください。

- Wall作成
- 画像アップロード
- Hold追加
- Route作成
- Route編集
- Route保存
- Route Export
- データ再読み込み後の復元

---

# 14. Non-goals

MVPでは以下を実装しないでください。

- AIによるホールド自動検出
- AIによるルート自動生成
- AIによる難易度推定
- 登攀動画解析
- アカウント登録・認証
- クラウドデータ同期
- サーバー側へのWall / Hold / Routeの永続保存
- Discord Bot
- Discord OAuth2
- 複数ユーザーによる共同編集
- ジム管理者向け機能
- WASM / OpenCV / ONNXによる画像処理
- SSR / ISR

ただし、将来の実装を妨げる設計にはしないでください。

---

# 15. Implementation Guidelines

以下を厳守してください。

1. まず既存リポジトリを調査してください。
2. 実装前に現在の構成と不足している機能を整理してください。
3. Node.jsとpnpmを使用してください。Bunは使用しないでください。
4. `pnpm-lock.yaml` をコミット対象とし、依存関係を再現可能にしてください。
5. ドメインモデルを先に定義してください。
6. Wall / Hold / Routeの依存関係を明確にしてください。
7. CanvasエンジンとReact UIを分離してください。
8. IndexedDBのアクセスを専用のRepository層に集約してください。
9. ZustandにはUI状態と編集状態を適切に分離して保持してください。
10. コンポーネントにビジネスロジックを詰め込まないでください。
11. 型安全性を重視し、安易な `any` を使用しないでください。
12. 不必要な依存ライブラリを追加しないでください。
13. 将来のAI機能のためだけに過剰な抽象化をしないでください。
14. UIの状態と永続化データを混同しないでください。
15. エラー処理とユーザーへのフィードバックを適切に実装してください。
16. 重要なドメインロジックにはテストを追加してください。
17. READMEに開発方法、アーキテクチャ、環境変数、デプロイ方法を記載してください。
18. CIではNode.jsをセットアップし、pnpmで依存関係をインストールしてください。
19. CIの依存関係インストールは `pnpm install --frozen-lockfile` を使用してください。

---

# 16. Development Workflow

以下の順序で実装を進めてください。

## Phase 1: Foundation

- Node.js / pnpm環境
- pnpm workspace
- Vite / React / TypeScript
- TanStack Router
- Tailwind CSS
- Hono / Cloudflare Workers
- Vitest / Playwright
- Biome
- 基本レイアウト

## Phase 2: Domain and Storage

- Wall / Hold / Routeモデル
- IndexedDB Repository
- ImageAsset管理
- データmigration
- Repositoryテスト

## Phase 3: Canvas Editor

- Canvasエンジン
- 画像表示
- Zoom / Pan
- Hold登録
- Hold移動・削除
- Route描画
- 座標変換
- Undo / Redo

## Phase 4: Route Management

- Wall一覧
- Wall詳細
- Route作成
- Route編集
- Route複製
- Route削除
- Route切り替え

## Phase 5: Export and Discord

- PNG Export
- Discord Webhook設定
- 接続テスト
- Route共有
- 作成・更新通知

## Phase 6: PWA and Quality

- PWA対応
- オフライン対応
- Unit Tests
- Integration Tests
- E2E Tests
- README
- Cloudflare Workersへのデプロイ確認

各Phaseの完了時にテストを実行し、既存機能を壊していないことを確認してください。

---

# 17. Final Acceptance Criteria

以下をすべて満たした状態をMVP完成としてください。

- Node.js + pnpmで開発・ビルドできる。
- 壁画像を登録できる。
- 1つの壁に複数のホールドを登録できる。
- ホールドは正規化座標で保存される。
- ホールドを移動・削除できる。
- 1つの壁に複数のルートを作成できる。
- 1つのホールドを複数ルートで共有できる。
- Start / Normal / Finishを設定できる。
- ルートの使用順序を変更できる。
- ルートをCanvas上に可視化できる。
- Undo / Redoが動作する。
- ルートをPNGでエクスポートできる。
- IndexedDBにデータが永続保存される。
- Discord Webhookを登録・テスト・解除できる。
- ルート画像をDiscordに共有できる。
- ルート作成・更新時の通知を設定できる。
- PWAとしてインストールできる。
- オフラインで基本的な編集ができる。
- テストが正常に通過する。
- 将来AIで検出したHoldと生成したRouteを既存のデータモデルで扱える。

最終的には、MVPとして実際に使える品質を優先してください。

将来のAI機能を考慮した設計は必要ですが、現時点で不要な機能や複雑な抽象化を実装しないでください。
