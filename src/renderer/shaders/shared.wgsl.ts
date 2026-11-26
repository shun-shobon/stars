/**
 * 全パスで共有するカメラと観測地の uniform。レイアウトは scene-uniforms.ts の書き込み順と一致させる。
 */
export const SCENE_UNIFORMS_WGSL = /* wgsl */ `
struct Scene {
  viewDir: vec3f,
  latitude: f32,
  right: vec3f,
  localSiderealTime: f32,
  up: vec3f,
  aspect: f32,
  cameraPosition: vec3f,
  tanHalfFov: f32,
  projectionScale: f32,
  cullRadius: f32,
}

@group(0) @binding(0) var<uniform> scene: Scene;
`;

/**
 * 赤道座標の天体を地平座標を経てクリップ座標へ投影する関数群。座標系は東 +X、天頂 +Y、北 +Z。
 */
export const CELESTIAL_PROJECTION_WGSL = /* wgsl */ `
const TWO_PI: f32 = 6.28318530718;

// 描画しない頂点をクリップ空間の外へ送る位置
const CULLED_POSITION = vec4f(0.0, 0.0, -2.0, 1.0);

fn horizontalToCartesian(az: f32, alt: f32) -> vec3f {
  let cosAlt = cos(alt);
  return vec3f(cosAlt * sin(az), sin(alt), cosAlt * cos(az));
}

// 戻り値は (方位角, 高度)。方位角は北を 0 として東回りに 0〜2π
fn equatorialToHorizontal(ra: f32, dec: f32) -> vec2f {
  let hourAngle = scene.localSiderealTime - ra;

  let sinDec = sin(dec);
  let cosDec = cos(dec);
  let sinLat = sin(scene.latitude);
  let cosLat = cos(scene.latitude);
  let cosHa = cos(hourAngle);
  let sinHa = sin(hourAngle);

  let alt = asin(clamp(sinDec * sinLat + cosDec * cosLat * cosHa, -1.0, 1.0));

  // 天頂付近では方位角が定まらない
  if (abs(cos(alt)) < 0.0001) {
    return vec2f(0.0, alt);
  }

  var az = atan2(-sinHa * cosDec, cosLat * sinDec - sinLat * cosDec * cosHa);
  if (az < 0.0) {
    az += TWO_PI;
  }
  return vec2f(az, alt);
}

// カメラの後方や視野外の点は CULLED_POSITION を返す
fn horizontalToClip(az: f32, alt: f32) -> vec4f {
  let toPoint = normalize(horizontalToCartesian(az, alt) - scene.cameraPosition);
  let depth = dot(toPoint, scene.viewDir);
  if (depth < 0.0) {
    return CULLED_POSITION;
  }
  if (acos(clamp(depth, -1.0, 1.0)) > scene.cullRadius) {
    return CULLED_POSITION;
  }

  let x = dot(toPoint, scene.right) / depth * scene.projectionScale / scene.aspect;
  let y = dot(toPoint, scene.up) / depth * scene.projectionScale;
  return vec4f(x, y, 0.5, 1.0);
}
`;

/**
 * 画面上の UV から、その画素が見ている天球上の地平座標を逆算する関数群。
 */
export const INVERSE_PROJECTION_WGSL = /* wgsl */ `
fn cartesianToHorizontal(dir: vec3f) -> vec2f {
  return vec2f(atan2(dir.x, dir.z), asin(clamp(dir.y, -1.0, 1.0)));
}

// 戻り値は (方位角, 高度)
fn uvToHorizontal(uv: vec2f) -> vec2f {
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let rayDir = normalize(
    scene.right * (ndc.x * scene.aspect * scene.tanHalfFov) +
    scene.up * (ndc.y * scene.tanHalfFov) +
    scene.viewDir
  );

  // カメラは天球の内側にあるので、視線と単位球の交点は前方に必ず1つある
  // |cameraPosition + t * rayDir| = 1 の正の解
  let b = dot(scene.cameraPosition, rayDir);
  let c = dot(scene.cameraPosition, scene.cameraPosition) - 1.0;
  let t = -b + sqrt(b * b - c);

  return cartesianToHorizontal(normalize(scene.cameraPosition + rayDir * t));
}
`;

/**
 * 画面全体を覆う2枚の三角形を描く頂点シェーダー。
 */
export const FULLSCREEN_VERTEX_WGSL = /* wgsl */ `
struct FullscreenOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> FullscreenOutput {
  let positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );

  let position = positions[vertexIndex];
  var output: FullscreenOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = vec2f(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return output;
}
`;
