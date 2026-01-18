/**
 * シルエット（建物スカイライン）シェーダー 地平線以下を黒でマスクして、建物のシルエットを表現
 *
 * 建物高さは事前計算された1Dテクスチャからサンプリング（高速化）
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

${inversePerspectiveFunctions}

${fullscreenQuadVertex}

// スカイラインテクスチャから建物高さを取得（度単位）
// r32floatはフィルタリング非対応のためtextureLoadを使用
fn getSkylineHeight(azimuth: f32) -> f32 {
  // 方位角を0〜2πに正規化
  var normalizedAz = azimuth - floor(azimuth / TWO_PI) * TWO_PI;
  if (normalizedAz < 0.0) {
    normalizedAz = normalizedAz + TWO_PI;
  }
  
  // 0〜1のUV座標に変換し、テクセル座標に変換
  let u = normalizedAz / TWO_PI;
  let texelX = u32(u * SKYLINE_TEXTURE_WIDTH) % u32(SKYLINE_TEXTURE_WIDTH);
  
  // テクスチャから直接ロード（フィルタリングなし）
  let height = textureLoad(skylineTexture, vec2u(texelX, 0), 0).r;
  
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
  
  // このピクセルでの建物高さをテクスチャから取得
  let skylineHeightDeg = getSkylineHeight(pixelAzimuth);
  
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
