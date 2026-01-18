/**
 * 共通シェーダーコード
 */

/**
 * 逆透視投影用の共通関数 UV座標から視線方向（方位角・高度）を正確に計算する
 */
export const inversePerspectiveFunctions = /* wgsl */ `
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

// 3Dベクトルから地平座標（方位角・高度）へ変換
fn cartesianToHorizontal(dir: vec3f) -> vec2f {
  let alt = asin(clamp(dir.y, -1.0, 1.0));
  let az = atan2(dir.x, dir.z);
  return vec2f(az, alt);
}

// FOVに応じたカメラオフセットを計算
fn calculateCameraOffset(fov: f32, minFov: f32, maxFov: f32, maxOffset: f32) -> f32 {
  let t = clamp((fov - minFov) / (maxFov - minFov), 0.0, 1.0);
  return maxOffset * t;
}

// UV座標から視線方向（方位角・高度）を計算（カメラオフセット対応）
fn uvToHorizontal(uv: vec2f, viewAz: f32, viewAlt: f32, fov: f32, aspect: f32, minFov: f32, maxFov: f32, maxCameraOffset: f32) -> vec2f {
  // NDC座標 (-1 to 1)
  let ndcX = (uv.x - 0.5) * 2.0;
  let ndcY = (0.5 - uv.y) * 2.0;  // Y軸反転（上が正）
  
  // 視線座標系での方向ベクトル
  let tanHalfFov = tan(fov * 0.5);
  let viewX = ndcX * aspect * tanHalfFov;
  let viewY = ndcY * tanHalfFov;
  let viewZ = 1.0;
  
  // 視線方向の3D位置
  let viewDir = horizontalToCartesian(viewAz, viewAlt);
  
  // 視線方向を基準とした座標系を構築
  let worldUp = vec3f(0.0, 1.0, 0.0);
  var right = cross(worldUp, viewDir);
  
  // 真上/真下を見ている場合の処理
  if (length(right) < 0.001) {
    right = vec3f(1.0, 0.0, 0.0);
  } else {
    right = normalize(right);
  }
  
  let up = normalize(cross(viewDir, right));
  
  // 視線座標系からワールド座標系への変換（カメラ位置からの方向）
  let rayDir = normalize(right * viewX + up * viewY + viewDir * viewZ);
  
  // FOVに応じたカメラオフセットを計算
  let cameraOffset = calculateCameraOffset(fov, minFov, maxFov, maxCameraOffset);
  let cameraPos = -viewDir * cameraOffset;
  
  // カメラ位置からrayDir方向に伸ばした直線と単位球の交点を求める
  // |cameraPos + t * rayDir| = 1 を解く
  // t^2 + 2*(cameraPos・rayDir)*t + (|cameraPos|^2 - 1) = 0
  let a = 1.0;  // |rayDir|^2 = 1
  let b = 2.0 * dot(cameraPos, rayDir);
  let c = dot(cameraPos, cameraPos) - 1.0;
  let discriminant = b * b - 4.0 * a * c;
  
  if (discriminant < 0.0) {
    // 交点なし（通常は起こらない）
    return cartesianToHorizontal(rayDir);
  }
  
  // 正の解（カメラの前方の交点）を選択
  let t = (-b + sqrt(discriminant)) / (2.0 * a);
  let intersectionPoint = cameraPos + rayDir * t;
  
  // ワールド座標系から方位角・高度を計算
  return cartesianToHorizontal(normalize(intersectionPoint));
}
`;

/**
 * フルスクリーンクワッドの頂点シェーダー部分
 */
export const fullscreenQuadVertex = /* wgsl */ `
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
`;
