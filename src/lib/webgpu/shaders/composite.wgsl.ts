/**
 * 最終合成シェーダー
 * シーンテクスチャ（背景+星）とブルームテクスチャを合成
 */

import { fullscreenQuadVertex } from "./common";

export const compositeShaderCode = /* wgsl */ `
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var bloomTexture: texture_2d<f32>;
@group(0) @binding(2) var texSampler: sampler;

${fullscreenQuadVertex}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let scene = textureSample(sceneTexture, texSampler, input.uv).rgb;
  let bloom = textureSample(bloomTexture, texSampler, input.uv).rgb;
  
  // シーンとブルームを合成（ブルーム強度を調整して1〜3等星を目立たせる）
  let bloomStrength = 2.0;
  var color = scene * 1.2 + bloom * bloomStrength;
  
  // ソフトなトーンマッピング（極端な明るさを抑えつつ中間域を保持）
  // Reinhard拡張: より緩やかな圧縮
  let whitePoint = 2.5;
  color = color * (1.0 + color / (whitePoint * whitePoint)) / (1.0 + color);
  
  return vec4f(color, 1.0);
}
`;
