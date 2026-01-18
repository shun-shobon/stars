/**
 * 星座線描画用WGSLシェーダー
 *
 * 各線分を細い矩形として描画する。 入力: ra1, dec1, ra2, dec2 (Float32 x 4)
 */

export const constellationShaderCode = /* wgsl */ `
struct Uniforms {
  azimuth: f32,         // 観測者の視線方位角
  altitude: f32,        // 観測者の視線高度角
  fov: f32,             // 視野角
  aspect: f32,          // アスペクト比
  latitude: f32,        // 観測地の緯度 (ラジアン)
  lst: f32,             // 地方恒星時 (ラジアン)
  lineWidth: f32,       // 線の太さ (NDC単位)
  lineAlpha: f32,       // 線の透明度
  minFov: f32,          // 最小視野角
  maxFov: f32,          // 最大視野角
  maxCameraOffset: f32, // カメラオフセット最大値
  padding: f32,         // 16バイトアライメント用パディング
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) lineData: vec4f,  // ra1, dec1, ra2, dec2
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) alpha: f32,
  @location(1) lineCoord: vec2f,
}

// 地平座標から3Dベクトルへ変換
fn horizontalToCartesian(az: f32, alt: f32) -> vec3f {
  let cosAlt = cos(alt);
  return vec3f(
    cosAlt * sin(az),
    sin(alt),
    cosAlt * cos(az)
  );
}

// 赤道座標から地平座標へ変換
fn equatorialToHorizontal(ra: f32, dec: f32, lat: f32, lst: f32) -> vec2f {
  let ha = lst - ra;
  
  let sinDec = sin(dec);
  let cosDec = cos(dec);
  let sinLat = sin(lat);
  let cosLat = cos(lat);
  let cosHa = cos(ha);
  let sinHa = sin(ha);
  
  let sinAlt = sinDec * sinLat + cosDec * cosLat * cosHa;
  let alt = asin(clamp(sinAlt, -1.0, 1.0));
  
  let cosAlt = cos(alt);
  var az: f32;
  if (abs(cosAlt) < 0.0001) {
    az = 0.0;
  } else {
    let x = -sinHa * cosDec;
    let y = cosLat * sinDec - sinLat * cosDec * cosHa;
    az = atan2(x, y);
    if (az < 0.0) {
      az = az + 2.0 * 3.14159265359;
    }
  }
  
  return vec2f(az, alt);
}

// FOVに応じたカメラオフセットを計算
fn calculateCameraOffset(fov: f32, minFov: f32, maxFov: f32, maxOffset: f32) -> f32 {
  let t = clamp((fov - minFov) / (maxFov - minFov), 0.0, 1.0);
  return maxOffset * t;
}

// 地平座標から画面座標へ変換（カメラオフセット対応）
fn horizontalToScreen(az: f32, alt: f32, viewAz: f32, viewAlt: f32, fov: f32, aspect: f32, minFov: f32, maxFov: f32, maxCameraOffset: f32) -> vec4f {
  // 点の3D位置（天球上、単位ベクトル）
  let pointPos = horizontalToCartesian(az, alt);
  
  // 視線方向の単位ベクトル
  let viewDir = horizontalToCartesian(viewAz, viewAlt);
  
  // FOVに応じたカメラオフセットを計算
  let cameraOffset = calculateCameraOffset(fov, minFov, maxFov, maxCameraOffset);
  let cameraPos = -viewDir * cameraOffset;
  
  // カメラから点へのベクトル
  let toPoint = pointPos - cameraPos;
  let toPointDist = length(toPoint);
  let toPointDir = toPoint / toPointDist;
  
  let worldUp = vec3f(0.0, 1.0, 0.0);
  var right = cross(worldUp, viewDir);
  
  if (length(right) < 0.001) {
    right = vec3f(1.0, 0.0, 0.0);
  } else {
    right = normalize(right);
  }
  
  let up = normalize(cross(viewDir, right));
  
  let dotProduct = dot(toPointDir, viewDir);
  if (dotProduct < 0.0) {
    return vec4f(0.0, 0.0, -2.0, 1.0);
  }
  
  let angularDist = acos(clamp(dotProduct, -1.0, 1.0));
  let diagonalFactor = sqrt(1.0 + aspect * aspect);
  let cullRadius = fov * 0.5 * diagonalFactor * 1.1;
  if (angularDist > cullRadius) {
    return vec4f(0.0, 0.0, -2.0, 1.0);
  }
  
  let x = dot(toPointDir, right);
  let y = dot(toPointDir, up);
  let z = dotProduct;
  
  let scale = 1.0 / tan(fov * 0.5);
  let screenX = (x / z) * scale / aspect;
  let screenY = (y / z) * scale;
  
  return vec4f(screenX, screenY, 0.5, 1.0);
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  let ra1 = input.lineData.x;
  let dec1 = input.lineData.y;
  let ra2 = input.lineData.z;
  let dec2 = input.lineData.w;
  
  // 両端点を地平座標に変換
  let horiz1 = equatorialToHorizontal(ra1, dec1, uniforms.latitude, uniforms.lst);
  let horiz2 = equatorialToHorizontal(ra2, dec2, uniforms.latitude, uniforms.lst);
  
  let az1 = horiz1.x;
  let alt1 = horiz1.y;
  let az2 = horiz2.x;
  let alt2 = horiz2.y;
  
  // 両端点のいずれかが地平線以下なら線分全体を非表示
  // （部分的なクリッピングは行わない）
  if (alt1 < -0.05 && alt2 < -0.05) {
    output.position = vec4f(0.0, 0.0, -2.0, 1.0);
    output.alpha = 0.0;
    output.lineCoord = vec2f(0.0, 0.0);
    return output;
  }
  
  // 画面座標に変換（カメラオフセット対応）
  let screen1 = horizontalToScreen(az1, alt1, uniforms.azimuth, uniforms.altitude, uniforms.fov, uniforms.aspect, uniforms.minFov, uniforms.maxFov, uniforms.maxCameraOffset);
  let screen2 = horizontalToScreen(az2, alt2, uniforms.azimuth, uniforms.altitude, uniforms.fov, uniforms.aspect, uniforms.minFov, uniforms.maxFov, uniforms.maxCameraOffset);
  
  // どちらかの端点が視野外なら線分全体を非表示
  // （片方だけ視野外の場合、その端点が(0,0)になり中央から線が伸びてしまうため）
  if (screen1.z < 0.0 || screen2.z < 0.0) {
    output.position = vec4f(0.0, 0.0, -2.0, 1.0);
    output.alpha = 0.0;
    output.lineCoord = vec2f(0.0, 0.0);
    return output;
  }
  
  // 線分の方向ベクトル
  let lineDelta = screen2.xy - screen1.xy;
  let lineLength = length(lineDelta);
  
  // 線分が短すぎる場合は非表示（ゼロ除算防止）
  if (lineLength < 0.0001) {
    output.position = vec4f(0.0, 0.0, -2.0, 1.0);
    output.alpha = 0.0;
    output.lineCoord = vec2f(0.0, 0.0);
    return output;
  }
  
  let lineDir = lineDelta / lineLength;
  
  // 垂直方向のオフセット（線幅）
  let perpendicular = vec2f(-lineDir.y, lineDir.x) * uniforms.lineWidth;
  
  // 6頂点の矩形を構成
  // 0--1
  // |  |
  // 3--2
  // 頂点順序: 0, 1, 2, 0, 2, 3
  var basePos: vec2f;
  var baseCoord: vec2f;
  var baseAlpha: f32 = uniforms.lineAlpha;
  
  switch (input.vertexIndex) {
    case 0u: {
      basePos = screen1.xy + perpendicular;
      baseCoord = vec2f(0.0, 1.0);
    }
    case 1u: {
      basePos = screen2.xy + perpendicular;
      baseCoord = vec2f(1.0, 1.0);
    }
    case 2u: {
      basePos = screen2.xy - perpendicular;
      baseCoord = vec2f(1.0, -1.0);
    }
    case 3u: {
      basePos = screen1.xy + perpendicular;
      baseCoord = vec2f(0.0, 1.0);
    }
    case 4u: {
      basePos = screen2.xy - perpendicular;
      baseCoord = vec2f(1.0, -1.0);
    }
    case 5u: {
      basePos = screen1.xy - perpendicular;
      baseCoord = vec2f(0.0, -1.0);
    }
    default: {
      basePos = screen1.xy;
      baseCoord = vec2f(0.0, 0.0);
    }
  }
  
  // 地平線に近い部分はフェードアウト
  let minAlt = min(alt1, alt2);
  if (minAlt < 0.1) {
    let fadeStart = 0.1;
    let fadeEnd = -0.05;
    let fade = clamp((minAlt - fadeEnd) / (fadeStart - fadeEnd), 0.0, 1.0);
    baseAlpha *= fade;
  }
  
  output.position = vec4f(basePos, 0.5, 1.0);
  output.alpha = baseAlpha;
  output.lineCoord = baseCoord;
  
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // 淡い青白色で星座線を描画
  let lineColor = vec3f(0.4, 0.5, 0.7);
  let edgeDist = 1.0 - abs(input.lineCoord.y);
  let edgeAa = max(fwidth(edgeDist), 0.0005);
  let edgeCoverage = smoothstep(0.0, edgeAa, edgeDist);

  let alpha = input.alpha * edgeCoverage;

  return vec4f(lineColor * alpha, alpha);
}
`;
