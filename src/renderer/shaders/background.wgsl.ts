import { MILKY_WAY_WGSL } from "./milky-way.wgsl";
import {
	FULLSCREEN_VERTEX_WGSL,
	INVERSE_PROJECTION_WGSL,
	SCENE_UNIFORMS_WGSL,
} from "./shared.wgsl";

/**
 * 夜空の地色に、天の川と、街明かりが空に反射して地平線の少し上が明るむ光害を重ねる。
 */
export const BACKGROUND_WGSL = /* wgsl */ `
${SCENE_UNIFORMS_WGSL}
${INVERSE_PROJECTION_WGSL}
${FULLSCREEN_VERTEX_WGSL}
${MILKY_WAY_WGSL}

override MILKY_WAY_INTENSITY: f32;

const SKY_COLOR = vec3f(0.0, 0.0, 0.02);
const SKYGLOW_COLOR = vec3f(0.4, 0.5, 0.8);
const SKYGLOW_PEAK_ALTITUDE_DEG = 8.0;
// 天頂での大気減光 [等級]。都市の霞んだ空を想定し、澄んだ空の 0.2 より大きくする
const EXTINCTION_MAG_PER_AIRMASS = 0.3;

fn skyglow(altitudeRad: f32) -> vec3f {
  let altDeg = degrees(altitudeRad);

  // 建物のシルエットに隠れる地平線の下から立ち上げ、8度付近を頂点に高度とともに減衰させる
  let horizonFade = smoothstep(-5.0, 2.0, altDeg);
  let glowFalloff = exp(-pow((altDeg - SKYGLOW_PEAK_ALTITUDE_DEG) / 18.0, 2.0));
  let highAltitudeFade = smoothstep(60.0, 20.0, altDeg);

  return SKYGLOW_COLOR * horizonFade * glowFalloff * highAltitudeFade * 0.15;
}

// 大気を通る間に残る光の割合。大気の厚みは地平線付近でも発散しない Rozenberg の近似式で求める
fn atmosphericTransmission(altitudeRad: f32) -> f32 {
  let sinAltitude = max(sin(altitudeRad), 0.0);
  let airmass = 1.0 / (sinAltitude + 0.025 * exp(-11.0 * sinAltitude));
  let horizonFade = smoothstep(-5.0, 0.0, degrees(altitudeRad));
  return pow(10.0, -0.4 * EXTINCTION_MAG_PER_AIRMASS * (airmass - 1.0)) * horizonFade;
}

@fragment
fn fragmentMain(input: FullscreenOutput) -> @location(0) vec4f {
  let direction = uvToDirection(input.uv);
  let altitude = asin(clamp(direction.y, -1.0, 1.0));
  let milkyWay = milkyWayRadiance(horizontalToEquatorial(direction)) *
    MILKY_WAY_INTENSITY * atmosphericTransmission(altitude) * scene.milkyWayVisibility;

  return vec4f(SKY_COLOR + skyglow(altitude) + milkyWay, 1.0);
}
`;
