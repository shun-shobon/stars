/**
 * 星空描画用WGSLシェーダー
 */

// 星描画用シェーダー（オフスクリーンレンダリング）
export const starShaderCode = /* wgsl */ `
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
  @location(0) starData: vec4f,  // ra, dec, magnitude, B-V color index
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) brightness: f32,
  @location(2) starColor: vec3f,
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

// 地平座標から画面座標へ変換
fn horizontalToScreen(az: f32, alt: f32, viewAz: f32, viewAlt: f32, fov: f32, aspect: f32) -> vec4f {
  // 星の3D位置
  let starDir = horizontalToCartesian(az, alt);
  
  // 視線方向の3D位置
  let viewDir = horizontalToCartesian(viewAz, viewAlt);
  
  // 視線方向を基準とした座標系を構築
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

// B-V色指数から星の色を計算 (黒体放射に基づく近似)
fn bvToColor(bv: f32) -> vec3f {
  // B-V色指数の範囲をクランプ (-0.4 ~ 2.0 が一般的)
  let bvClamped = clamp(bv, -0.4, 2.0);
  
  var r: f32;
  var g: f32;
  var b: f32;
  
  // 青い星 (B-V < 0): O型、B型星
  if (bvClamped < 0.0) {
    let t = (bvClamped + 0.4) / 0.4;  // 0 to 1
    r = 0.6 + 0.25 * t;
    g = 0.7 + 0.25 * t;
    b = 1.0;
  }
  // 白〜青白い星 (0 <= B-V < 0.4): A型、F型星
  else if (bvClamped < 0.4) {
    let t = bvClamped / 0.4;
    r = 0.85 + 0.15 * t;
    g = 0.95 + 0.05 * t;
    b = 1.0 - 0.05 * t;
  }
  // 黄白〜黄色い星 (0.4 <= B-V < 0.8): F型、G型星 (太陽に近い)
  else if (bvClamped < 0.8) {
    let t = (bvClamped - 0.4) / 0.4;
    r = 1.0;
    g = 1.0 - 0.1 * t;
    b = 0.95 - 0.2 * t;
  }
  // オレンジ色の星 (0.8 <= B-V < 1.4): K型星
  else if (bvClamped < 1.4) {
    let t = (bvClamped - 0.8) / 0.6;
    r = 1.0;
    g = 0.9 - 0.3 * t;
    b = 0.75 - 0.35 * t;
  }
  // 赤い星 (B-V >= 1.4): M型星
  else {
    let t = min((bvClamped - 1.4) / 0.6, 1.0);
    r = 1.0;
    g = 0.6 - 0.2 * t;
    b = 0.4 - 0.2 * t;
  }
  
  return vec3f(r, g, b);
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  let ra = input.starData.x;
  let dec = input.starData.y;
  let mag = input.starData.z;
  let bv = input.starData.w;
  
  // 地平座標に変換
  let horizontal = equatorialToHorizontal(ra, dec, uniforms.latitude, uniforms.lst);
  let az = horizontal.x;
  let alt = horizontal.y;
  
  // 地平線以下の星を除外
  if (alt < -0.1) {
    output.position = vec4f(0.0, 0.0, -2.0, 1.0);
    output.brightness = 0.0;
    output.uv = vec2f(0.0, 0.0);
    output.starColor = vec3f(0.0, 0.0, 0.0);
    return output;
  }
  
  // 画面座標に変換
  let screenPos = horizontalToScreen(az, alt, uniforms.azimuth, uniforms.altitude, uniforms.fov, uniforms.aspect);
  
  // 等級から明るさとサイズを計算
  let visibleLimit = 6.5;
  let normalizedMag = (mag - uniforms.minMag) / (visibleLimit - uniforms.minMag);
  
  var brightness: f32;
  if (mag <= visibleLimit) {
    brightness = pow(1.0 - clamp(normalizedMag, 0.0, 1.0), 1.5) * 0.85 + 0.15;
  } else {
    let extraDim = (mag - visibleLimit) / (uniforms.maxMag - visibleLimit);
    brightness = 0.12 * (1.0 - extraDim * 0.7);
  }
  
  // サイズ
  var baseSize: f32;
  if (mag <= 1.0) {
    baseSize = mix(0.015, 0.025, (1.0 - mag) / 2.5);
  } else if (mag <= visibleLimit) {
    baseSize = mix(0.004, 0.015, 1.0 - (mag - 1.0) / (visibleLimit - 1.0));
  } else {
    baseSize = 0.003;
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
  output.starColor = bvToColor(bv);
  
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let dist = length(input.uv);
  if (dist > 1.0) {
    discard;
  }
  
  // シャープな星のコア + 軽いグロー
  let core = smoothstep(1.0, 0.3, dist);
  let intensity = core * input.brightness;
  
  return vec4f(input.starColor * intensity, intensity);
}
`;

// ブルーム用の輝度抽出シェーダー
export const brightPassShaderCode = /* wgsl */ `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  
  // フルスクリーンクワッド
  let positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, 1.0)
  );
  
  let uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0),
    vec2f(1.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 0.0)
  );
  
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(inputTexture, inputSampler, input.uv);
  
  // 輝度を計算
  let luminance = dot(color.rgb, vec3f(0.299, 0.587, 0.114));
  
  // 閾値以上の明るい部分のみ抽出
  let threshold = 0.15;
  let softness = 0.5;
  let brightness = smoothstep(threshold, threshold + softness, luminance);
  
  return vec4f(color.rgb * brightness, 1.0);
}
`;

// ガウシアンブラーシェーダー（水平/垂直）
export const blurShaderCode = /* wgsl */ `
struct BlurUniforms {
  direction: vec2f,  // (1,0) for horizontal, (0,1) for vertical
  texelSize: vec2f,  // 1.0 / textureSize
}

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: BlurUniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  
  let positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, 1.0)
  );
  
  let uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0),
    vec2f(1.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 0.0)
  );
  
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // 9-tap ガウシアンブラー
  let weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  
  let offset = uniforms.direction * uniforms.texelSize;
  
  var result = textureSample(inputTexture, inputSampler, input.uv).rgb * weights[0];
  
  for (var i = 1; i < 5; i++) {
    let o = offset * f32(i) * 2.0;
    result += textureSample(inputTexture, inputSampler, input.uv + o).rgb * weights[i];
    result += textureSample(inputTexture, inputSampler, input.uv - o).rgb * weights[i];
  }
  
  return vec4f(result, 1.0);
}
`;

// 最終合成シェーダー
export const compositeShaderCode = /* wgsl */ `
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var bloomTexture: texture_2d<f32>;
@group(0) @binding(2) var texSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  
  let positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, 1.0)
  );
  
  let uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0),
    vec2f(1.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 0.0)
  );
  
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let scene = textureSample(sceneTexture, texSampler, input.uv).rgb;
  let bloom = textureSample(bloomTexture, texSampler, input.uv).rgb;
  
  // シーンとブルームを合成
  let bloomStrength = 1.2;
  var color = scene + bloom * bloomStrength;
  
  // 簡易トーンマッピング
  color = color / (color + vec3f(1.0));
  
  // 夜空の背景色を追加
  let skyColor = vec3f(0.0, 0.0, 0.02);
  color = max(color, skyColor);
  
  return vec4f(color, 1.0);
}
`;
