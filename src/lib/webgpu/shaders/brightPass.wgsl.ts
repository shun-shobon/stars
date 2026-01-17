/**
 * ブルーム用の輝度抽出シェーダー
 */

import { fullscreenQuadVertex } from "./common";

export const brightPassShaderCode = /* wgsl */ `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

${fullscreenQuadVertex}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(inputTexture, inputSampler, input.uv);
  
  // 輝度を計算
  let luminance = dot(color.rgb, vec3f(0.299, 0.587, 0.114));
  
  // ソフトニー圧縮で極端な輝度を抑制（1〜3等星を残しつつシリウス級を抑える）
  let knee = 0.5;
  let tonedLuminance = luminance / (luminance + knee);
  
  // 閾値を少し上げ、softnessを広げて中間域のブルームを確保
  let threshold = 0.08;
  let softness = 0.4;
  let bloomMask = smoothstep(threshold, threshold + softness, tonedLuminance);
  
  // ブルーム強度を調整（極端な明るさは圧縮済みなので控えめに）
  let bloomIntensity = 1.2;
  return vec4f(color.rgb * bloomMask * bloomIntensity, 1.0);
}
`;
