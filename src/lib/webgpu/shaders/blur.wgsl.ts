/**
 * ガウシアンブラーシェーダー（水平/垂直） 5タップの軽量版（モバイル向け最適化）
 */

import { fullscreenQuadVertex } from "./common";

export const blurShaderCode = /* wgsl */ `
struct BlurUniforms {
  direction: vec2f,  // (1,0) for horizontal, (0,1) for vertical
  texelSize: vec2f,  // 1.0 / textureSize
}

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: BlurUniforms;

${fullscreenQuadVertex}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // 5-tap ガウシアンブラー（軽量版）
  // 重み: [0.0625, 0.25, 0.375, 0.25, 0.0625] の対称部分
  let w0 = 0.375;   // 中心
  let w1 = 0.25;    // ±1
  let w2 = 0.0625;  // ±2
  
  // サンプリング間隔を広げて、低解像度でも広い範囲をぼかす
  let spreadFactor = 2.5;
  let offset = uniforms.direction * uniforms.texelSize * spreadFactor;
  
  var result = textureSample(inputTexture, inputSampler, input.uv).rgb * w0;
  result += textureSample(inputTexture, inputSampler, input.uv + offset).rgb * w1;
  result += textureSample(inputTexture, inputSampler, input.uv - offset).rgb * w1;
  result += textureSample(inputTexture, inputSampler, input.uv + offset * 2.0).rgb * w2;
  result += textureSample(inputTexture, inputSampler, input.uv - offset * 2.0).rgb * w2;
  
  return vec4f(result, 1.0);
}
`;
