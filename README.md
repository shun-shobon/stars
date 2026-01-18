# Stars

WebGPUを使用した星空レンダリングWebアプリケーション。東京からの星空をリアルタイムで表示し、ドラッグ操作で視点を変更できます。

## 機能

- WebGPUによる高速な星空レンダリング
- 東京（緯度35.6762°、経度139.6503°）からの視点
- マウスドラッグによる視点操作
- リアルタイムな星の位置計算

## 技術スタック

- React 19
- TypeScript
- Vite
- Tailwind CSS
- WebGPU API
- Cloudflare Workers（デプロイ）

## セットアップ

### 必要要件

- mise

### インストール

```bash
# ツールのインストール
mise install

# 依存関係のインストール
pnpm install
```

## 使用可能なスクリプト

```bash
# 開発サーバーの起動
pnpm dev

# プロダクションビルド
pnpm build

# ローカルプレビュー（Wrangler）
pnpm preview

# コードのフォーマット
pnpm format

# フォーマットのチェック
pnpm format:check

# リンター実行
pnpm lint

# リンターの自動修正
pnpm lint:fix

# 型チェック
pnpm typecheck
```
