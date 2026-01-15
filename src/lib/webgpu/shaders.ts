/**
 * 星空描画用WGSLシェーダー
 */

export const shaderCode = /* wgsl */ `
struct Uniforms {
  azimuth: f32,      // 観測者の視線方位角
  altitude: f32,     // 観測者の視線高度角
  fov: f32,          // 視野角
  aspect: f32,       // アスペクト比
  latitude: f32,     // 観測地の緯度 (ラジアン)
  lst: f32,          // 地方恒星時 (ラジアン)
  minMag: f32,       // 最小等級
  maxMag: f32,       // 最大等級
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) starData: vec3f,  // ra, dec, magnitude
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) brightness: f32,
  @location(2) colorTemp: f32,
}

// 赤道座標から地平座標へ変換
fn equatorialToHorizontal(ra: f32, dec: f32, lat: f32, lst: f32) -> vec2f {
  // 時角
  let ha = lst - ra;
  
  let sinDec = sin(dec);
  let cosDec = cos(dec);
  let sinLat = sin(lat);
  let cosLat = cos(lat);
  let cosHa = cos(ha);
  let sinHa = sin(ha);
  
  // 高度
  let sinAlt = sinDec * sinLat + cosDec * cosLat * cosHa;
  let alt = asin(clamp(sinAlt, -1.0, 1.0));
  
  // 方位角
  let cosAlt = cos(alt);
  var az: f32;
  if (abs(cosAlt) < 0.0001) {
    az = 0.0;
  } else {
    let cosAz = (sinDec - sinAlt * sinLat) / (cosAlt * cosLat);
    az = acos(clamp(cosAz, -1.0, 1.0));
    if (sinHa > 0.0) {
      az = 2.0 * 3.14159265359 - az;
    }
  }
  
  return vec2f(az, alt);
}

// 地平座標から3Dベクトルへ変換
fn horizontalToCartesian(az: f32, alt: f32) -> vec3f {
  let cosAlt = cos(alt);
  // 北=+Z, 東=+X, 上=+Y の座標系
  return vec3f(
    cosAlt * sin(az),   // X: 東方向
    sin(alt),           // Y: 上方向
    cosAlt * cos(az)    // Z: 北方向
  );
}

// 地平座標から画面座標へ変換
fn horizontalToScreen(az: f32, alt: f32, viewAz: f32, viewAlt: f32, fov: f32, aspect: f32) -> vec4f {
  // 星の3D位置
  let starDir = horizontalToCartesian(az, alt);
  
  // 視線方向の3D位置
  let viewDir = horizontalToCartesian(viewAz, viewAlt);
  
  // 視線方向を基準とした座標系を構築
  // right: 視線の右方向 (東寄り)
  // up: 視線の上方向
  let worldUp = vec3f(0.0, 1.0, 0.0);
  var right = cross(viewDir, worldUp);
  
  // 真上/真下を見ている場合の処理
  if (length(right) < 0.001) {
    right = vec3f(1.0, 0.0, 0.0);
  } else {
    right = normalize(right);
  }
  
  let up = normalize(cross(right, viewDir));
  
  // 星が視線方向の前方にあるかチェック
  let dotProduct = dot(starDir, viewDir);
  if (dotProduct < 0.0) {
    // 視線の後ろ側にある星は除外
    return vec4f(0.0, 0.0, -2.0, 1.0);
  }
  
  // 視線中心からの角度距離
  let angularDist = acos(clamp(dotProduct, -1.0, 1.0));
  
  // 視野外の星を除外
  if (angularDist > fov * 0.6) {
    return vec4f(0.0, 0.0, -2.0, 1.0);
  }
  
  // 星を視線座標系に投影
  let x = dot(starDir, right);
  let y = dot(starDir, up);
  let z = dotProduct;
  
  // 透視投影
  let scale = 1.0 / tan(fov * 0.5);
  let screenX = (x / z) * scale / aspect;
  let screenY = (y / z) * scale;
  
  // 視野の端に近い星は弱める
  let w = cos(angularDist * 0.8);
  
  return vec4f(screenX, screenY, 0.5, w);
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  let ra = input.starData.x;
  let dec = input.starData.y;
  let mag = input.starData.z;
  
  // 地平座標に変換
  let horizontal = equatorialToHorizontal(ra, dec, uniforms.latitude, uniforms.lst);
  let az = horizontal.x;
  let alt = horizontal.y;
  
  // 地平線以下の星を除外
  if (alt < -0.1) {
    output.position = vec4f(0.0, 0.0, -2.0, 1.0);
    output.brightness = 0.0;
    output.uv = vec2f(0.0, 0.0);
    output.colorTemp = 0.0;
    return output;
  }
  
  // 画面座標に変換
  let screenPos = horizontalToScreen(az, alt, uniforms.azimuth, uniforms.altitude, uniforms.fov, uniforms.aspect);
  
  // 等級から明るさとサイズを計算
  // 肉眼で見える星は約6等級まで。それより暗い星も表示するが控えめに
  let visibleLimit = 6.5;  // 肉眼限界等級
  
  // 等級を正規化 (明るい星 = 0, 肉眼限界 = 1, それ以上暗い = 1以上)
  let normalizedMag = (mag - uniforms.minMag) / (visibleLimit - uniforms.minMag);
  
  // 明るさ: 肉眼で見える星は明るく、それ以上暗い星は控えめに
  var brightness: f32;
  if (mag <= visibleLimit) {
    // 肉眼で見える星: 1等級ごとに約2.5倍の明るさの差
    // ただし、表示上は差を圧縮して暗い星も見えるようにする
    brightness = pow(1.0 - normalizedMag, 1.5) * 0.8 + 0.2;
  } else {
    // 肉眼限界以上に暗い星: かなり控えめに表示
    let extraDim = (mag - visibleLimit) / (uniforms.maxMag - visibleLimit);
    brightness = 0.15 * (1.0 - extraDim * 0.7);
  }
  
  // サイズ: 明るい星は大きく、暗い星は小さく
  var baseSize: f32;
  if (mag <= 1.0) {
    // 非常に明るい星 (1等星以上)
    baseSize = mix(0.02, 0.035, (1.0 - mag) / 2.5);
  } else if (mag <= visibleLimit) {
    // 肉眼で見える星
    baseSize = mix(0.006, 0.02, 1.0 - (mag - 1.0) / (visibleLimit - 1.0));
  } else {
    // 暗い星
    baseSize = 0.004;
  }
  
  // クワッドの頂点位置
  let quadVertices = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, 1.0)
  );
  
  let vertexOffset = quadVertices[input.vertexIndex];
  let size = baseSize * screenPos.w;
  
  output.position = vec4f(
    screenPos.x + vertexOffset.x * size / uniforms.aspect,
    screenPos.y + vertexOffset.y * size,
    screenPos.z,
    1.0
  );
  
  output.uv = vertexOffset;
  output.brightness = brightness * screenPos.w;
  
  // 等級に基づく色温度 (簡易的: 明るい星は青白く、暗い星は赤っぽく)
  output.colorTemp = clamp(1.0 - normalizedMag * 0.3, 0.0, 1.0);
  
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // 円形のグラデーション
  let dist = length(input.uv);
  if (dist > 1.0) {
    discard;
  }
  
  // ガウシアンブルーで星らしいグロー効果
  let glow = exp(-dist * dist * 2.5);
  
  // 色計算 (色温度に基づく)
  let temp = input.colorTemp;
  let r = mix(1.0, 0.85, temp * 0.3);
  let g = mix(0.95, 1.0, temp * 0.2);
  let b = mix(0.9, 1.0, temp * 0.4);
  
  let color = vec3f(r, g, b);
  
  // 明るさ適用 - より明るく表示
  let brightness = input.brightness * glow * 1.5;
  let alpha = min(brightness * 2.5, 1.0);
  
  return vec4f(color * brightness, alpha);
}
`;
