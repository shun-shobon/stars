import {
	FULLSCREEN_VERTEX_WGSL,
	INVERSE_PROJECTION_WGSL,
	SCENE_UNIFORMS_WGSL,
} from "./shared.wgsl";

/**
 * 夜空の地色に、街明かりが空に反射して地平線の少し上が明るむ光害を重ねる。
 */
export const BACKGROUND_WGSL = /* wgsl */ `
${SCENE_UNIFORMS_WGSL}
${INVERSE_PROJECTION_WGSL}
${FULLSCREEN_VERTEX_WGSL}

const SKY_COLOR = vec3f(0.0, 0.0, 0.02);
const SKYGLOW_COLOR = vec3f(0.4, 0.5, 0.8);
const SKYGLOW_PEAK_ALTITUDE_DEG = 8.0;

fn skyglow(altitudeRad: f32) -> vec3f {
  let altDeg = degrees(altitudeRad);

  // 建物のシルエットに隠れる地平線の下から立ち上げ、8度付近を頂点に高度とともに減衰させる
  let horizonFade = smoothstep(-5.0, 2.0, altDeg);
  let glowFalloff = exp(-pow((altDeg - SKYGLOW_PEAK_ALTITUDE_DEG) / 18.0, 2.0));
  let highAltitudeFade = smoothstep(60.0, 20.0, altDeg);

  return SKYGLOW_COLOR * horizonFade * glowFalloff * highAltitudeFade * 0.15;
}

@fragment
fn fragmentMain(input: FullscreenOutput) -> @location(0) vec4f {
  let altitude = uvToHorizontal(input.uv).y;
  return vec4f(SKY_COLOR + skyglow(altitude), 1.0);
}
`;
