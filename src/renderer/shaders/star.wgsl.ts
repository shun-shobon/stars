import { CELESTIAL_PROJECTION_WGSL, SCENE_UNIFORMS_WGSL } from "./shared.wgsl";

/**
 * 星を1つずつ小さな四角形のインスタンスとして描く。入力は星カタログの1レコード。
 */
export const STAR_WGSL = /* wgsl */ `
${SCENE_UNIFORMS_WGSL}
${CELESTIAL_PROJECTION_WGSL}

// カタログ中で最も暗い星の等級
override FAINTEST_MAGNITUDE: f32;

// 肉眼で見える限界。これより暗い星はさらに減光する
const NAKED_EYE_LIMIT_MAGNITUDE = 6.5;
// 明るさとサイズの基準にする等級。1〜3等星が目立つよう2等星にする
const REFERENCE_MAGNITUDE = 2.0;

struct StarInput {
  // 赤経, 赤緯, 視等級, B-V 色指数
  @location(0) record: vec4f,
  @builtin(vertex_index) vertexIndex: u32,
}

struct StarOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) brightness: f32,
  @location(2) color: vec3f,
}

// B-V 色指数から黒体放射に近い星の色を求める
fn bvToColor(bv: f32) -> vec3f {
  let b = clamp(bv, -0.4, 2.0);

  // O・B 型
  if (b < 0.0) {
    let t = (b + 0.4) / 0.4;
    return vec3f(0.6 + 0.25 * t, 0.7 + 0.25 * t, 1.0);
  }
  // A・F 型
  if (b < 0.4) {
    let t = b / 0.4;
    return vec3f(0.85 + 0.15 * t, 0.95 + 0.05 * t, 1.0 - 0.05 * t);
  }
  // F・G 型
  if (b < 0.8) {
    let t = (b - 0.4) / 0.4;
    return vec3f(1.0, 1.0 - 0.1 * t, 0.95 - 0.2 * t);
  }
  // K 型
  if (b < 1.4) {
    let t = (b - 0.8) / 0.6;
    return vec3f(1.0, 0.9 - 0.3 * t, 0.75 - 0.35 * t);
  }
  // M 型
  let t = min((b - 1.4) / 0.6, 1.0);
  return vec3f(1.0, 0.6 - 0.2 * t, 0.4 - 0.2 * t);
}

// 等級から求めた光度を、基準等級で 1 になるようソフトニーで圧縮する。極端に明るい星だけが突出しないようにする
fn normalizedBrightness(magnitude: f32) -> f32 {
  let flux = pow(10.0, -0.4 * magnitude);
  let referenceFlux = pow(10.0, -0.4 * REFERENCE_MAGNITUDE);
  let knee = 0.8 * referenceFlux;
  return (flux / (flux + knee)) / (referenceFlux / (referenceFlux + knee));
}

@vertex
fn vertexMain(input: StarInput) -> StarOutput {
  var output: StarOutput;

  let horizontal = equatorialToHorizontal(input.record.x, input.record.y);
  if (horizontal.y < 0.0) {
    output.position = CULLED_POSITION;
    return output;
  }

  let magnitude = input.record.z;
  let normalized = normalizedBrightness(magnitude);

  // ガンマで中間の明るさを持ち上げる
  var brightness = pow(normalized, 0.6) * 1.5 + 0.4;
  if (magnitude > NAKED_EYE_LIMIT_MAGNITUDE) {
    let dimming = (magnitude - NAKED_EYE_LIMIT_MAGNITUDE) / (FAINTEST_MAGNITUDE - NAKED_EYE_LIMIT_MAGNITUDE);
    brightness *= 1.0 - dimming * 0.7;
  }
  let size = 0.0015 + 0.004 * pow(normalized, 0.45);

  let corners = array<vec2f, 4>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));
  let corner = corners[input.vertexIndex];
  let center = horizontalToClip(horizontal.x, horizontal.y);

  output.position = vec4f(
    center.x + corner.x * size / scene.aspect,
    center.y + corner.y * size,
    center.z,
    1.0,
  );
  output.uv = corner;
  output.brightness = brightness;
  output.color = bvToColor(input.record.w);
  return output;
}

@fragment
fn fragmentMain(input: StarOutput) -> @location(0) vec4f {
  let distance = length(input.uv);
  if (distance > 1.0) {
    discard;
  }

  let intensity = smoothstep(1.0, 0.3, distance) * input.brightness;
  return vec4f(input.color * intensity, intensity);
}
`;
