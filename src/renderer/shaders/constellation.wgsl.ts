import { CELESTIAL_PROJECTION_WGSL, SCENE_UNIFORMS_WGSL } from "./shared.wgsl";

/**
 * 星座線の1本を細い四角形のインスタンスとして描く。入力は星座線カタログの1レコード。
 */
export const CONSTELLATION_WGSL = /* wgsl */ `
${SCENE_UNIFORMS_WGSL}
${CELESTIAL_PROJECTION_WGSL}

const LINE_COLOR = vec3f(0.4, 0.5, 0.7);
const LINE_ALPHA = 0.6;
// 線の太さの半分（クリップ座標）
const LINE_HALF_WIDTH = 0.002;
// 地平線の手前で線を薄くし始める高度と、消えきる高度（ラジアン）
const FADE_START_ALTITUDE = 0.1;
const FADE_END_ALTITUDE = -0.05;

struct LineInput {
  // 始点の赤経, 赤緯, 終点の赤経, 赤緯
  @location(0) record: vec4f,
  @builtin(vertex_index) vertexIndex: u32,
}

struct LineOutput {
  @builtin(position) position: vec4f,
  @location(0) alpha: f32,
  // y は線の中心を 0、両端を ±1 とした位置
  @location(1) lineCoord: vec2f,
}

fn culledLine() -> LineOutput {
  var output: LineOutput;
  output.position = CULLED_POSITION;
  return output;
}

@vertex
fn vertexMain(input: LineInput) -> LineOutput {
  let startPoint = equatorialToHorizontal(input.record.x, input.record.y);
  let endPoint = equatorialToHorizontal(input.record.z, input.record.w);
  if (startPoint.y < FADE_END_ALTITUDE && endPoint.y < FADE_END_ALTITUDE) {
    return culledLine();
  }

  // 片方の端だけ視野外だと、その端が原点に置かれて画面中央から線が伸びてしまうため、線ごと省く
  let startClip = horizontalToClip(startPoint.x, startPoint.y);
  let endClip = horizontalToClip(endPoint.x, endPoint.y);
  if (startClip.z < 0.0 || endClip.z < 0.0) {
    return culledLine();
  }

  let delta = endClip.xy - startClip.xy;
  let lineLength = length(delta);
  if (lineLength < 0.0001) {
    return culledLine();
  }

  let normal = vec2f(-delta.y, delta.x) / lineLength * LINE_HALF_WIDTH;

  // triangle-strip の頂点順: 0 = 始点+法線, 1 = 終点+法線, 2 = 始点-法線, 3 = 終点-法線
  let isEnd = input.vertexIndex % 2u == 1u;
  let side = select(-1.0, 1.0, input.vertexIndex < 2u);

  let fade = clamp(
    (min(startPoint.y, endPoint.y) - FADE_END_ALTITUDE) / (FADE_START_ALTITUDE - FADE_END_ALTITUDE),
    0.0,
    1.0,
  );

  var output: LineOutput;
  output.position = vec4f(select(startClip.xy, endClip.xy, isEnd) + normal * side, 0.5, 1.0);
  output.alpha = LINE_ALPHA * fade;
  output.lineCoord = vec2f(select(0.0, 1.0, isEnd), side);
  return output;
}

@fragment
fn fragmentMain(input: LineOutput) -> @location(0) vec4f {
  let edgeDistance = 1.0 - abs(input.lineCoord.y);
  let coverage = smoothstep(0.0, max(fwidth(edgeDistance), 0.0005), edgeDistance);
  let alpha = input.alpha * coverage;
  return vec4f(LINE_COLOR * alpha, alpha);
}
`;
