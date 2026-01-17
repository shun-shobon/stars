/**
 * シルエット（建物スカイライン）シェーダー 地平線以下を黒でマスクして、建物のシルエットを表現
 */

import { fullscreenQuadVertex, inversePerspectiveFunctions } from "./common";

export const silhouetteShaderCode = /* wgsl */ `
@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct CameraUniforms {
  altitude: f32,     // 視線の高度角 (ラジアン)
  fov: f32,          // 視野角 (ラジアン)
  aspect: f32,       // アスペクト比
  azimuth: f32,      // 方位角 (ラジアン)
}

// 1Dハッシュ関数
fn hash11(p: f32) -> f32 {
  return fract(sin(p * 127.1) * 43758.5453);
}

// 1Dノイズ関数（滑らかな補間）
fn noise1d(x: f32) -> f32 {
  let i = floor(x);
  let f = fract(x);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}

${inversePerspectiveFunctions}

${fullscreenQuadVertex}

// スカイラインパラメータ
const BASE_HEIGHT_DEG: f32 = 1.0;        // 最低の建物高さ（度）
const HEIGHT_AMPLITUDE_DEG: f32 = 5.0;   // 高さの変動幅（度）
const FLOOR_QUANTIZE_DEG: f32 = 0.4;     // 階数の刻み（度）
const BUILDING_WIDTH_MIN: f32 = 0.015;   // 最小建物幅（ラジアン）
const BUILDING_WIDTH_MAX: f32 = 0.06;    // 最大建物幅（ラジアン）
const BUILDING_SCALE: f32 = 80.0;        // 建物数のスケール
const TWO_PI: f32 = 6.28318530718;
const BUILDING_PROBABILITY: f32 = 0.35;  // 建物が存在する確率（35%）

// 建物インデックスと高さを計算
fn getBuildingHeight(azimuth: f32) -> f32 {
  // 方位角を0〜2πに正規化（全方位でビルを描画するため）
  var normalizedAz = azimuth - floor(azimuth / TWO_PI) * TWO_PI;
  if (normalizedAz < 0.0) {
    normalizedAz = normalizedAz + TWO_PI;
  }
  
  // 累積ノイズで建物境界を決定
  let scaledX = normalizedAz * BUILDING_SCALE;
  
  // 建物インデックスを累積ノイズで計算（幅のバリエーション）
  var accum: f32 = 0.0;
  var buildingIdx: f32 = 0.0;
  
  // ループで累積幅を計算して建物インデックスを求める
  for (var i: i32 = 0; i < 200; i = i + 1) {
    let idx = f32(i);
    // 各建物の幅をノイズで決定
    let widthNoise = hash11(idx * 17.3 + 0.5);
    let buildingWidth = mix(BUILDING_WIDTH_MIN, BUILDING_WIDTH_MAX, widthNoise) * BUILDING_SCALE;
    
    if (accum + buildingWidth > scaledX) {
      buildingIdx = idx;
      break;
    }
    accum = accum + buildingWidth;
    buildingIdx = idx;
  }
  
  // 建物が存在するかどうかをノイズで決定
  // 低周波ノイズで「街区のまとまり」を作り、その中でさらにランダムに建物を配置
  let clusterNoise = noise1d(buildingIdx * 0.08);  // 街区のまとまり
  let existsNoise = hash11(buildingIdx * 73.9 + 0.3);
  
  // 街区が発展している場所（clusterNoise > 0.4）では建物が建ちやすい
  let localProbability = BUILDING_PROBABILITY + clusterNoise * 0.3;
  
  if (existsNoise > localProbability) {
    // 建物がない場所：地平線レベル
    return 0.0;
  }
  
  // 建物の高さをノイズで決定
  let highFreq = hash11(buildingIdx * 31.7);
  
  // 高さを合成（街区のまとまりで高さも変わる）
  let rawHeight = clusterNoise * 0.5 + highFreq * 0.5;
  
  // 階数単位で量子化してビルらしいフラットな天端に
  let heightDeg = BASE_HEIGHT_DEG + rawHeight * HEIGHT_AMPLITUDE_DEG;
  let quantizedHeight = floor(heightDeg / FLOOR_QUANTIZE_DEG) * FLOOR_QUANTIZE_DEG;
  
  return quantizedHeight;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // UV座標から正確な方位角・高度を計算（透視投影の逆変換）
  let horizontal = uvToHorizontal(input.uv, camera.azimuth, camera.altitude, camera.fov, camera.aspect);
  let pixelAzimuth = horizontal.x;
  let pixelAltitude = horizontal.y;
  
  // 高度を度に変換
  let altDeg = pixelAltitude * 57.2957795; // rad to deg
  
  // このピクセルでの建物高さを取得（方位角を使用）
  let skylineHeightDeg = getBuildingHeight(pixelAzimuth);
  
  // シルエット判定（アンチエイリアス付き）
  let edgeWidth = fwidth(altDeg) * 1.5;
  let edge = smoothstep(0.0, edgeWidth, altDeg - skylineHeightDeg);
  
  if (edge < 0.5) {
    // シルエット領域：完全に黒
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  
  // シルエット領域外：透明（何も描画しない）
  discard;
  return vec4f(0.0, 0.0, 0.0, 0.0);
}
`;
