# Agent Guidelines for Stars Project

このドキュメントは、AIコーディングエージェントがこのリポジトリで作業する際の指針を提供します。

## プロジェクト概要

WebGPUを使用した星空レンダリングWebアプリケーション。東京からの星空をリアルタイムで表示し、ドラッグ操作で視点を変更できます。

**技術スタック:**

- React 19.2.3
- TypeScript 5.9.3
- Vite 7.3.1 (ビルドツール)
- Tailwind CSS 4.1.18
- WebGPU API
- pnpm (パッケージマネージャー)

## ビルド・開発コマンド

```bash
# 開発サーバー起動
pnpm dev

# プロダクションビルド
pnpm build

# 型チェック
pnpm typecheck

# リント実行
pnpm lint

# リント自動修正
pnpm lint:fix

# フォーマット実行
pnpm format

# フォーマットチェック
pnpm format:check
```

**注意:** このプロジェクトにはテストフレームワークが含まれていません。

## コードスタイルガイドライン

### 1. インポート

**順序:**

1. type インポート（`import type`）
2. 外部ライブラリ
3. 内部モジュール（`~/`エイリアス使用）

**パスエイリアス:**

- `~/` - `src/` ディレクトリを指す
- 例: `import { useStarfield } from "~/hooks/useStarfield"`

**例:**

```typescript
import type { FC } from "react";
import { useEffect, useRef } from "react";

import { useStarfield } from "~/hooks/useStarfield";
```

### 2. TypeScript

**厳格な型付け:**

- `@tsconfig/strictest` を使用
- `any` 型の使用を避ける
- すべての関数に戻り値の型を明示
- interface よりも type を優先（必要に応じて使い分け）

**型定義の例:**

```typescript
export interface StarfieldMeta {
	starCount: number;
	minMagnitude: number;
	maxMagnitude: number;
}

export function useStarfield(): UseStarfieldResult {
	// implementation
}
```

**ESLintディレクティブの使用:**
必要な場合のみESLintルールを無効化し、理由をコメントで明記：

```typescript
// eslint-disable-next-line typescript/no-unnecessary-condition -- navigator.gpu may be undefined in non-supporting browsers
if (!navigator.gpu) {
	throw new Error("WebGPUがサポートされていません");
}
```

### 3. フォーマット

**Prettier設定:**

- `@shun-shobon/style-guide/prettier` を使用
- タブ幅: 2スペース
- セミコロン: あり
- クォート: ダブルクォート

**保存時のフォーマット:** コードを変更した後は必ず `pnpm format`
を実行してください。

### 4. 命名規則

**変数・関数:**

- camelCase を使用
- boolean値は `is`, `has`, `should` などの接頭辞
- 例: `isLoading`, `hasError`, `shouldRender`

**コンポーネント:**

- PascalCase を使用
- ファイル名とコンポーネント名を一致させる
- 例: `Starfield.tsx` → `const Starfield: FC = () => {}`

**定数:**

- UPPER_SNAKE_CASE を使用
- 例: `TOKYO_LATITUDE`, `TOKYO_LONGITUDE`

**型・インターフェース:**

- PascalCase を使用
- Props型は `ComponentNameProps` の形式
- Result型は `useFunctionNameResult` の形式

### 5. React

**コンポーネント定義:**

```typescript
import type { FC } from "react";

const ComponentName: FC = () => {
	return <div>Content</div>;
};

export default ComponentName;
```

**Hooks:**

- カスタムフックは `use` で始める
- 戻り値の型を明示
- `useCallback`, `useMemo` を適切に使用してパフォーマンス最適化

**Ref の使用:**

```typescript
const canvasRef = useRef<HTMLCanvasElement | null>(null);
```

### 6. エラーハンドリング

**非同期処理:**

```typescript
try {
	await renderer.init(canvas);
	await renderer.loadStarData();
	setIsLoading(false);
} catch (error_) {
	setError(error_ instanceof Error ? error_.message : "初期化に失敗しました");
	setIsLoading(false);
}
```

**エラーメッセージ:**

- 日本語でユーザーフレンドリーなメッセージを提供
- 開発者向けの詳細情報も含める

**nullチェック:**

```typescript
const canvas = canvasRef.current;
if (!canvas) return;
```

### 7. コメント

**JSDoc形式:**

```typescript
/**
 * 星空表示コンポーネント
 */
```

**日本語コメント:**

- このプロジェクトでは日本語コメントを使用
- 複雑なロジックには説明を追加

### 8. ファイル構成

```
src/
├── components/     # Reactコンポーネント
├── constants/      # 定数定義
├── data/           # データファイル（JSON）
├── hooks/          # カスタムフック
├── lib/            # ユーティリティ・ライブラリ
│   └── webgpu/     # WebGPU関連コード
├── index.tsx       # エントリーポイント
├── styles.css      # グローバルスタイル
└── worker.ts       # Web Worker
```

### 9. スタイリング

**Tailwind CSS:**

- ユーティリティクラスを使用
- カスタムCSSは最小限に
- レスポンシブデザインを考慮

**例:**

```typescript
<div className="flex h-screen w-screen items-center justify-center bg-gray-900">
	<div className="rounded-lg bg-red-900/50 p-6 text-center">
		<h2 className="mb-2 text-xl font-bold text-red-300">エラー</h2>
	</div>
</div>;
```

## CI/CD

GitHub Actionsで以下をチェック:

- `pnpm run lint`
- `pnpm run format:check`
- `pnpm run typecheck`
- `pnpm run build`

コミット前にすべてのチェックが通ることを確認してください。

## 重要な注意事項

1. **WebGPU互換性**:
   WebGPUが未サポートのブラウザに対してエラーハンドリングを実装
2. **パフォーマンス**: requestAnimationFrame を使用したレンダリングループ
3. **メモリ管理**: WebGPUリソース（buffer, texture等）は適切にdispose
4. **アクセシビリティ**: canvasにaria-labelを追加

## コミットメッセージ

簡潔で明確な日本語または英語のコミットメッセージを使用してください。

**例:**

- `feat: 星の輝度計算を改善`
- `fix: タッチ操作時のドラッグ動作を修正`
- `refactor: WebGPUパイプライン初期化を整理`
