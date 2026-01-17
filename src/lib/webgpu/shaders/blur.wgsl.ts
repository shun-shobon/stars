/**
 * ガウシアンブラーシェーダー（水平/垂直）
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
  // 9-tap ガウシアンブラー
  let weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  
  let offset = uniforms.direction * uniforms.texelSize;
  
  var result = textureSample(inputTexture, inputSampler, input.uv).rgb * weights[0];
  
  for (var i = 1; i < 5; i++) {
    let o = offset * f32(i) * 2.0;
    result += textureSample(inputTexture, inputSampler, input.uv + o).rgb * weights[i];
    result += textureSample(inputTexture, inputSampler, input.uv - o).rgb * weights[i];
  }
  
  return vec4f(result, 1.0);
}
`;
