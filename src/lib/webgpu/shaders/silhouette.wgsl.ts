/**
 * シルエット（建物スカイライン）シェーダー 空気遠近法を適用した3レイヤーの建物シルエットを表現
 *
 * レイヤー構成（奥から手前へ）：
 *
 * - 遠景（layer 0）：霞んだ青みグレー
 * - 中景（layer 1）：暗いグレー
 * - 前景（layer 2）：完全な黒
 *
 * 建物高さは事前計算された2Dテクスチャ（2048 x 3）からサンプリング
 */

import { fullscreenQuadVertex, inversePerspectiveFunctions } from "./common";

export const silhouetteShaderCode = /* wgsl */ `
@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var skylineTexture: texture_2d<f32>;

struct CameraUniforms {
  altitude: f32,     // 視線の高度角 (ラジアン)
  fov: f32,          // 視野角 (ラジアン)
  aspect: f32,       // アスペクト比
  azimuth: f32,      // 方位角 (ラジアン)
}

const TWO_PI: f32 = 6.28318530718;
const SKYLINE_TEXTURE_WIDTH: f32 = 2048.0;
const SKYLINE_LAYER_COUNT: u32 = 3u;

// レイヤー色（遠景から前景へ、空気遠近法）
// 遠いほど霞んで青みがかり、近いほど暗い
const LAYER_COLORS: array<vec3f, 3> = array<vec3f, 3>(
  vec3f(0.12, 0.14, 0.22), // 遠景：霞んだ青みグレー（明るめ）
  vec3f(0.05, 0.05, 0.08), // 中景：暗いグレー
  vec3f(0.015, 0.015, 0.02), // 前景：非常に暗いグレー（完全な黒ではない）
);

${inversePerspectiveFunctions}

${fullscreenQuadVertex}

// スカイラインテクスチャから指定レイヤーの建物高さを取得（度単位）
// r32floatはフィルタリング非対応のためtextureLoadを使用
fn getSkylineHeight(azimuth: f32, layer: u32) -> f32 {
  // 方位角を0〜2πに正規化
  var normalizedAz = azimuth - floor(azimuth / TWO_PI) * TWO_PI;
  if (normalizedAz < 0.0) {
    normalizedAz = normalizedAz + TWO_PI;
  }
  
  // 0〜1のUV座標に変換し、テクセル座標に変換
  let u = normalizedAz / TWO_PI;
  let texelX = u32(u * SKYLINE_TEXTURE_WIDTH) % u32(SKYLINE_TEXTURE_WIDTH);
  
  // テクスチャから直接ロード（layer = y座標）
  let height = textureLoad(skylineTexture, vec2u(texelX, layer), 0).r;
  
  return height;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // UV座標から正確な方位角・高度を計算（透視投影の逆変換）
  let horizontal = uvToHorizontal(input.uv, camera.azimuth, camera.altitude, camera.fov, camera.aspect);
  let pixelAzimuth = horizontal.x;
  let pixelAltitude = horizontal.y;
  
  // 高度を度に変換
  let altDeg = pixelAltitude * 57.2957795; // rad to deg
  
  // アンチエイリアス用のエッジ幅
  let edgeWidth = fwidth(altDeg) * 1.5;
  
  // 最終的な色（初期値：透明を示す特殊値）
  var finalColor = vec3f(-1.0, -1.0, -1.0);
  var isInSilhouette = false;
  
  // 遠景から前景へ順にレイヤーを処理（奥から手前へ上書き）
  for (var layer = 0u; layer < SKYLINE_LAYER_COUNT; layer = layer + 1u) {
    let skylineHeightDeg = getSkylineHeight(pixelAzimuth, layer);
    
    // シルエット判定（アンチエイリアス付き）
    let edge = smoothstep(0.0, edgeWidth, altDeg - skylineHeightDeg);
    
    if (edge < 0.5) {
      // このレイヤーのシルエット内：レイヤー色で上書き
      finalColor = LAYER_COLORS[layer];
      isInSilhouette = true;
    }
  }
  
  if (isInSilhouette) {
    return vec4f(finalColor, 1.0);
  }
  
  // シルエット領域外：透明（何も描画しない）
  discard;
  return vec4f(0.0, 0.0, 0.0, 0.0);
}
`;
