import { FULLSCREEN_VERTEX_WGSL } from "./shared.wgsl";

/**
 * ブルームの元になる明るい部分だけをシーンから取り出す。
 */
export const BRIGHT_PASS_WGSL = /* wgsl */ `
${FULLSCREEN_VERTEX_WGSL}

@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;

@fragment
fn fragmentMain(input: FullscreenOutput) -> @location(0) vec4f {
  let color = textureSample(sceneTexture, linearSampler, input.uv).rgb;
  let luminance = dot(color, vec3f(0.299, 0.587, 0.114));

  // 輝度をソフトニーで圧縮してからしきい値をかけ、1〜3等星のにじみを残しつつシリウス級だけが突出しないようにする
  let tonedLuminance = luminance / (luminance + 0.5);
  let bloomMask = smoothstep(0.08, 0.48, tonedLuminance);

  return vec4f(color * bloomMask * 1.2, 1.0);
}
`;
