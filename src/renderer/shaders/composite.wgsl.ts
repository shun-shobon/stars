import {
	FULLSCREEN_VERTEX_WGSL,
	INVERSE_PROJECTION_WGSL,
	SCENE_UNIFORMS_WGSL,
} from "./shared.wgsl";

/**
 * シーンとブルームを合成してトーンマップし、手前に建物のシルエットを重ねて画面に出す。
 */
export const COMPOSITE_WGSL = /* wgsl */ `
${SCENE_UNIFORMS_WGSL}
${INVERSE_PROJECTION_WGSL}
${FULLSCREEN_VERTEX_WGSL}

override IS_HDR: bool;
override EXPOSURE: f32;
override BLOOM_STRENGTH: f32;

@group(1) @binding(0) var sceneTexture: texture_2d<f32>;
@group(1) @binding(1) var bloomTexture: texture_2d<f32>;
@group(1) @binding(2) var linearSampler: sampler;
// 各行が1レイヤー、各列が方位角に対応する建物の高さ（度）
@group(1) @binding(3) var skylineTexture: texture_2d<f32>;

const TWO_PI: f32 = 6.28318530718;

// 建物のレイヤーの色。skyline-heights.ts のレイヤーと同じく遠景から前景の順。遠いほど霞んで青く明るい
const SKYLINE_LAYER_COLORS = array<vec3f, 3>(
  vec3f(0.12, 0.14, 0.22),
  vec3f(0.05, 0.05, 0.08),
  vec3f(0.015, 0.015, 0.02),
);

// SDR 用の拡張 Reinhard
fn tonemapSdr(color: vec3f) -> vec3f {
  let whitePoint = 2.5;
  return color * (1.0 + color / (whitePoint * whitePoint)) / (1.0 + color);
}

// HDR 用。ハイライトを残し、極端な値だけを緩やかに圧縮する
fn tonemapHdr(color: vec3f) -> vec3f {
  return color / (1.0 + color * 0.5 / 4.0);
}

// r32float はフィルタリングできないので textureLoad で読む
fn skylineHeightDeg(azimuth: f32, layer: u32) -> f32 {
  let width = textureDimensions(skylineTexture).x;
  let u = fract(azimuth / TWO_PI);
  let texelX = u32(u * f32(width)) % width;
  return textureLoad(skylineTexture, vec2u(texelX, layer), 0).r;
}

@fragment
fn fragmentMain(input: FullscreenOutput) -> @location(0) vec4f {
  let sceneColor = textureSample(sceneTexture, linearSampler, input.uv).rgb;
  let bloomColor = textureSample(bloomTexture, linearSampler, input.uv).rgb;
  let hdrColor = sceneColor * EXPOSURE + bloomColor * BLOOM_STRENGTH;
  var color = select(tonemapSdr(hdrColor), tonemapHdr(hdrColor), IS_HDR);

  let horizontal = uvToHorizontal(input.uv);
  let altDeg = degrees(horizontal.y);
  let edgeWidth = fwidth(altDeg) * 1.5;

  // 前景のレイヤーほど後に評価し、重なったら手前の色で上書きする
  for (var layer = 0u; layer < 3u; layer++) {
    let edge = smoothstep(0.0, edgeWidth, altDeg - skylineHeightDeg(horizontal.x, layer));
    if (edge < 0.5) {
      color = SKYLINE_LAYER_COLORS[layer];
    }
  }

  return vec4f(color, 1.0);
}
`;
