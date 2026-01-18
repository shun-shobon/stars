/**
 * 星描画用WGSLシェーダー
 */

export const starShaderCode = /* wgsl */ `
struct Uniforms {
  azimuth: f32,         // 観測者の視線方位角
  altitude: f32,        // 観測者の視線高度角
  fov: f32,             // 視野角
  aspect: f32,          // アスペクト比
  latitude: f32,        // 観測地の緯度 (ラジアン)
  lst: f32,             // 地方恒星時 (ラジアン)
  minMag: f32,          // 最小等級
  maxMag: f32,          // 最大等級
  minFov: f32,          // 最小視野角
  maxFov: f32,          // 最大視野角
  maxCameraOffset: f32, // カメラオフセット最大値
  padding: f32,         // 16バイトアライメント用パディング
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
  // 時角 (Hour Angle)
  let ha = lst - ra;
  
  let sinDec = sin(dec);
  let cosDec = cos(dec);
  let sinLat = sin(lat);
  let cosLat = cos(lat);
  let cosHa = cos(ha);
  let sinHa = sin(ha);
  
  // 高度 (Altitude)
  let sinAlt = sinDec * sinLat + cosDec * cosLat * cosHa;
  let alt = asin(clamp(sinAlt, -1.0, 1.0));
  
  // 方位角 (Azimuth) - 北=0, 東=90度, 南=180度, 西=270度
  let cosAlt = cos(alt);
  var az: f32;
  if (abs(cosAlt) < 0.0001) {
    // 天頂付近
    az = 0.0;
  } else {
    // atan2を使って方位角を計算（より正確）
    let x = -sinHa * cosDec;
    let y = cosLat * sinDec - sinLat * cosDec * cosHa;
    az = atan2(x, y);
    // 0〜2πに正規化
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
  // 星の3D位置（天球上、単位ベクトル）
  let starPos = horizontalToCartesian(az, alt);
  
  // 視線方向の単位ベクトル
  let viewDir = horizontalToCartesian(viewAz, viewAlt);
  
  // FOVに応じたカメラオフセットを計算
  // カメラ位置 = 視線方向の逆方向にオフセット
  let cameraOffset = calculateCameraOffset(fov, minFov, maxFov, maxCameraOffset);
  let cameraPos = -viewDir * cameraOffset;
  
  // カメラから星へのベクトル
  let toStar = starPos - cameraPos;
  let toStarDist = length(toStar);
  let toStarDir = toStar / toStarDist;
  
  // 視線方向を基準とした座標系を構築
  // 右手座標系: right = worldUp × viewDir (視線方向を見たときの右方向)
  let worldUp = vec3f(0.0, 1.0, 0.0);
  var right = cross(worldUp, viewDir);
  
  // 真上/真下を見ている場合の処理
  if (length(right) < 0.001) {
    right = vec3f(1.0, 0.0, 0.0);
  } else {
    right = normalize(right);
  }
  
  let up = normalize(cross(viewDir, right));
  
  // 星が視線方向の前方にあるかチェック
  let dotProduct = dot(toStarDir, viewDir);
  if (dotProduct < 0.0) {
    return vec4f(0.0, 0.0, -2.0, 1.0);
  }
  
  // 視線中心からの角度距離（カリング用）
  let angularDist = acos(clamp(dotProduct, -1.0, 1.0));
  
  // 視野外の星を除外（矩形画面の対角線をカバーする半径を計算）
  // 対角線の長さ = sqrt(1 + aspect^2) * (FOV/2)
  let diagonalFactor = sqrt(1.0 + aspect * aspect);
  let cullRadius = fov * 0.5 * diagonalFactor * 1.1;  // 少し余裕を持たせる
  if (angularDist > cullRadius) {
    return vec4f(0.0, 0.0, -2.0, 1.0);
  }
  
  // 星を視線座標系に投影
  let x = dot(toStarDir, right);
  let y = dot(toStarDir, up);
  let z = dotProduct;
  
  // 透視投影
  let scale = 1.0 / tan(fov * 0.5);
  let screenX = (x / z) * scale / aspect;
  let screenY = (y / z) * scale;
  
  return vec4f(screenX, screenY, 0.5, 1.0);
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
  
  // 地平線以下の星を除外（0度でカットオフ）
  if (alt < 0.0) {
    output.position = vec4f(0.0, 0.0, -2.0, 1.0);
    output.brightness = 0.0;
    output.uv = vec2f(0.0, 0.0);
    output.starColor = vec3f(0.0, 0.0, 0.0);
    return output;
  }
  
  // 画面座標に変換（カメラオフセット対応）
  let screenPos = horizontalToScreen(az, alt, uniforms.azimuth, uniforms.altitude, uniforms.fov, uniforms.aspect, uniforms.minFov, uniforms.maxFov, uniforms.maxCameraOffset);
  
  // 等級から明るさとサイズを計算（等級差ベース + ソフトニー圧縮）
  // 等級差: 1等級 = 2.512倍の光度比
  // flux = 10^(-0.4 * mag)
  let flux = pow(10.0, -0.4 * mag);
  
  // 参照等級（2等星を基準にして1〜3等星が目立つように）
  let refMag = 2.0;
  let refFlux = pow(10.0, -0.4 * refMag);
  
  // ソフトニー圧縮（極端な明るさを滑らかに抑制、クランプなし）
  // knee値が大きいほど圧縮が強くなる
  let knee = 0.8 * refFlux;
  let toneFlux = flux / (flux + knee);
  let toneRef = refFlux / (refFlux + knee);
  
  // 正規化された明るさ（参照等級で1.0になる）
  let normalizedBrightness = toneFlux / toneRef;
  
  // 明るさ: ガンマ補正で中間域を持ち上げ
  let brightnessGamma = 0.6;
  let brightnessScale = 1.5;
  let brightnessOffset = 0.4;
  var brightness = pow(normalizedBrightness, brightnessGamma) * brightnessScale + brightnessOffset;
  
  // 6.5等星より暗い星は減衰
  let visibleLimit = 6.5;
  if (mag > visibleLimit) {
    let extraDim = (mag - visibleLimit) / (uniforms.maxMag - visibleLimit);
    brightness = brightness * (1.0 - extraDim * 0.7);
  }
  
  // サイズ: 同じソフトニー曲線を使用（全体的にコンパクトに）
  let sizeGamma = 0.45;
  let minSize = 0.0015;
  let sizeRange = 0.004;
  var baseSize = minSize + sizeRange * pow(normalizedBrightness, sizeGamma);
  
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
  let size = baseSize;
  
  output.position = vec4f(
    screenPos.x + vertexOffset.x * size / uniforms.aspect,
    screenPos.y + vertexOffset.y * size,
    screenPos.z,
    1.0
  );
  
  output.uv = vertexOffset;
  output.brightness = brightness;
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
