/**
 * 最終合成シェーダー シーンテクスチャ（背景+星）とブルームテクスチャを合成
 */

import { fullscreenQuadVertex } from "./common";

export const compositeShaderCode = /* wgsl */ `
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var bloomTexture: texture_2d<f32>;
@group(0) @binding(2) var texSampler: sampler;
@group(0) @binding(3) var<uniform> settings: CompositeSettings;

struct CompositeSettings {
  toneMappingMode: f32,  // 0: SDR Reinhard, 1: HDR リニア/軽量
  exposure: f32,         // 露出補正
  bloomStrength: f32,    // ブルーム強度
  padding: f32,          // アライメント用
}

${fullscreenQuadVertex}

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
  
  return vec4f(color, 1.0);
}
`;
