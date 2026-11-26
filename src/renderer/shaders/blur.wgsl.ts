import { FULLSCREEN_VERTEX_WGSL } from "./shared.wgsl";

/**
 * 縦横どちらか一方向の5タップのガウシアンブラー。方向はパイプラインの override 定数で決める。
 */
export const BLUR_WGSL = /* wgsl */ `
${FULLSCREEN_VERTEX_WGSL}

override IS_HORIZONTAL: bool;

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;

// 低解像度のテクスチャでも広くにじむよう、サンプル間隔を広げる
const SPREAD = 2.5;

@fragment
fn fragmentMain(input: FullscreenOutput) -> @location(0) vec4f {
  let direction = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), IS_HORIZONTAL);
  let texelSize = 1.0 / vec2f(textureDimensions(inputTexture));
  let offset = direction * texelSize * SPREAD;

  var result = textureSample(inputTexture, linearSampler, input.uv).rgb * 0.375;
  result += textureSample(inputTexture, linearSampler, input.uv + offset).rgb * 0.25;
  result += textureSample(inputTexture, linearSampler, input.uv - offset).rgb * 0.25;
  result += textureSample(inputTexture, linearSampler, input.uv + offset * 2.0).rgb * 0.0625;
  result += textureSample(inputTexture, linearSampler, input.uv - offset * 2.0).rgb * 0.0625;

  return vec4f(result, 1.0);
}
`;
