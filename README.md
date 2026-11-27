# Stars

東京から見た今の星空を WebGPU で描く Web アプリです。

https://stars.s2n.tech/

## 特徴

- Hipparcos 星表の約12万個の星と星座線を、時刻に合わせた位置に描く
- Gaia の星表から作られた天の川を重ね、ズームするほど細かい画像に切り替える
- 等級と色指数から星の明るさと色を決め、ブルームで光のにじみを表す
- 街明かりの光害と、地平線の建物のシルエットを重ねる
- 日時（日本時間）を指定して、その時刻の空を見られる
- ドラッグで視点を動かし、ホイールやピンチでズームする。操作していない間はゆっくり回る

## 動作環境

WebGPU と Temporal API の両方に対応したブラウザーが必要です。対応していないブラウザーでは、足りない機能を示すメッセージを表示します。

## データの出典

- 天の川: NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC.（[Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851)）

## ライセンス

MIT
