# AGENTS.md

東京から見た星空を WebGPU で描く Web アプリ。Cloudflare Workers の静的アセットとして配信する。

## 開発コマンド

Node.js と pnpm は `mise.toml` で固定している。`mise install` の後に `pnpm install` する。

```bash
pnpm dev            # 開発サーバー
pnpm build          # 本番ビルド
pnpm preview        # ビルド結果を workerd で確認
pnpm test           # Vitest
pnpm typecheck      # src・worker・スクリプトと設定ファイルの3つの tsconfig を検査
pnpm lint           # Oxlint（pnpm lint:fix で自動修正）
pnpm format         # Oxfmt（pnpm format:check で検査のみ）
pnpm knip           # 未使用のファイル・export・依存の検出
pnpm gen:catalog    # data/ の CSV から星カタログを再生成
pnpm gen:milky-way  # NASA の天の川の画像から天の川のタイルを再生成（初回は約400MBを .cache/ にダウンロード）
pnpm typegen        # wrangler.toml を変えたら Worker の型を再生成
```

## ディレクトリ構成

```
src/
├── domain/     天体・カメラ・投影の計算と、星カタログと天の川のタイルの形式。DOM・WebGPU・React に依存しない
├── catalog/    星カタログと天の川のタイルの取得と検証。catalog-meta.json は生成物
├── renderer/   WebGPU による描画。WGSL は shaders/ に置く
├── viewer/     描画ループ、カメラの状態と入力、canvas の解像度、天の川のタイルの読み込み
├── ui/         React のコンポーネント
└── main.tsx
worker/         Cloudflare Worker。/api/* だけを処理し、それ以外は静的アセットを返す
scripts/        node で直接実行するスクリプト
data/           星カタログの元データ（Hipparcos 星表と星座線の CSV）
public/         配信する静的ファイル。stars.bin、constellations.bin、milky-way/ は生成物
```

依存の向きは `ui → viewer → renderer・catalog → domain` で、右側にだけ依存する（間を飛ばしてもよい）。逆向きの import と、レイヤーをまたぐ相対パスの import は `pnpm lint` がエラーにする。レイヤーをまたぐ import は `~/` から書く。

`tsconfig.json` はディレクトリごとに置き、ファイルから最も近いものが効く。ルートは Node.js で動く設定ファイルとスクリプト、`src/` はブラウザー、`worker/` は Workers の実行環境向け。

## 設計の判断基準

- カメラや方位ラベルの位置のように毎フレーム変わる値は React の state にしない。viewer が持ち、ラベルは `subscribeFrame` で DOM を直接動かす。
- 時刻は `Temporal.Instant` で扱い、表示と入力は `domain/observer.ts` の観測地のタイムゾーンを通す。WebGPU と Temporal に対応しないブラウザーには代替の経路を作らず、エラーを表示する。
- シェーダーの uniform は `renderer/shaders/shared.wgsl.ts` の `Scene` 構造体1つにまとめる。フィールドを変えるときは `renderer/scene-uniforms.ts` の詰め順とサイズを合わせる。パイプラインごとに決まる値は override 定数か WGSL の `const` にし、uniform を増やさない。
- 星カタログのバイナリ形式は `domain/catalog-format.ts` を基準に、生成スクリプト・読み込み・シェーダーの頂点入力をそろえ、`pnpm gen:catalog` で再生成する。読み込みの途中でも明るい星から現れるよう、星は明るい順に並べる。
- 天の川は赤道座標の立方体の6面を4分木で分けたタイルで持ち、背景のパスが画素ごとに要るレベルを選んで引く。タイルの形式は `domain/milky-way-format.ts`、レベルの選び方は `domain/milky-way-tiles.ts` を基準に、生成スクリプトとシェーダーをそろえる。シェーダーの定数はこれらの TS の値から埋め込む。届いていないタイルは粗いレベルで代えて描く。
- 利用者に見せる文言は日本語、エラーメッセージとログは英語で書く。エラーは `ui/describe-error.ts` で利用者向けの説明に変える。

## テスト

`domain` の計算と、`catalog` の読み込みのような外部との接続点を Vitest で検証する。WebGPU の描画はテストで確かめられないので、描画やシェーダーを変えたらブラウザーで表示を確認する。

## コミット

Conventional Commits の `<type>: <日本語の件名>` で、1コミットに1つの目的を持たせる。
