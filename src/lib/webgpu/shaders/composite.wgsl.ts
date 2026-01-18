/**
 * 最終合成シェーダー シーンテクスチャ（背景+星）とブルームテクスチャを合成
 */

import { fullscreenQuadVertex, inversePerspectiveFunctions } from "./common";

export const compositeShaderCode = /* wgsl */ `
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var bloomTexture: texture_2d<f32>;
@group(0) @binding(2) var texSampler: sampler;
@group(0) @binding(3) var<uniform> settings: CompositeSettings;
@group(0) @binding(4) var<uniform> camera: CameraUniforms;
@group(0) @binding(5) var skylineTexture: texture_2d<f32>;

struct CompositeSettings {
  toneMappingMode: f32,  // 0: SDR Reinhard, 1: HDR リニア/軽量
  exposure: f32,         // 露出補正
  bloomStrength: f32,    // ブルーム強度
  padding: f32,          // アライメント用
}

struct CameraUniforms {
  viewDir: vec3f,
  _pad0: f32,
  right: vec3f,
  _pad1: f32,
  up: vec3f,
  _pad2: f32,
  cameraPos: vec3f,
  _pad3: f32,
  tanHalfFov: f32,
  aspect: f32,
  padding: vec2f,
}

${fullscreenQuadVertex}

${inversePerspectiveFunctions}

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

// SDR用トーンマッピング（Reinhard拡張）
fn tonemapSDR(color: vec3f) -> vec3f {
  let whitePoint = 2.5;
  return color * (1.0 + color / (whitePoint * whitePoint)) / (1.0 + color);
}

// HDR用トーンマッピング（軽量な圧縮、ハイライトを残す）
fn tonemapHDR(color: vec3f) -> vec3f {
  // HDRディスプレイ向けにハイライトを維持
  // 緩やかなソフトクリップで極端な値のみ圧縮
  let maxValue = 4.0;
  let softness = 0.5;
  let compressed = color / (1.0 + color * softness / maxValue);
  return compressed;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let scene = textureSample(sceneTexture, texSampler, input.uv).rgb;
  let bloom = textureSample(bloomTexture, texSampler, input.uv).rgb;
  
  // シーンとブルームを合成
  var color = scene * settings.exposure + bloom * settings.bloomStrength;
  
  // トーンマッピングモードに応じて処理を切り替え
  if (settings.toneMappingMode < 0.5) {
    // SDRモード: Reinhard拡張
    color = tonemapSDR(color);
  } else {
    // HDRモード: 軽量トーンマップ
    color = tonemapHDR(color);
  }

  // シルエット（建物スカイライン）を合成後に上書き
  let horizontal = uvToHorizontal(input.uv);
  let pixelAzimuth = horizontal.x;
  let pixelAltitude = horizontal.y;
  let altDeg = pixelAltitude * 57.2957795; // rad to deg
  let edgeWidth = fwidth(altDeg) * 1.5;

  var finalColor = vec3f(-1.0, -1.0, -1.0);
  var isInSilhouette = false;

  for (var layer = 0u; layer < SKYLINE_LAYER_COUNT; layer = layer + 1u) {
    let skylineHeightDeg = getSkylineHeight(pixelAzimuth, layer);
    let edge = smoothstep(0.0, edgeWidth, altDeg - skylineHeightDeg);
    if (edge < 0.5) {
      finalColor = LAYER_COLORS[layer];
      isInSilhouette = true;
    }
  }

  if (isInSilhouette) {
    color = finalColor;
  }
  
  return vec4f(color, 1.0);
}
`;
