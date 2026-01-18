/**
 * 共通シェーダーコード
 */

/**
 * 逆透視投影用の共通関数 UV座標から視線方向（方位角・高度）を正確に計算する
 */
export const inversePerspectiveFunctions = /* wgsl */ `
// 3Dベクトルから地平座標（方位角・高度）へ変換
fn cartesianToHorizontal(dir: vec3f) -> vec2f {
  let alt = asin(clamp(dir.y, -1.0, 1.0));
  let az = atan2(dir.x, dir.z);
  return vec2f(az, alt);
}

// UV座標から視線方向（方位角・高度）を計算（事前計算済みカメラ基底を使用）
fn uvToHorizontal(uv: vec2f) -> vec2f {
  // NDC座標 (-1 to 1)
  let ndcX = (uv.x - 0.5) * 2.0;
  let ndcY = (0.5 - uv.y) * 2.0;  // Y軸反転（上が正）
  
  // 視線座標系での方向ベクトル
  let viewX = ndcX * camera.aspect * camera.tanHalfFov;
  let viewY = ndcY * camera.tanHalfFov;
  let viewZ = 1.0;
  
  // 視線座標系からワールド座標系への変換（カメラ位置からの方向）
  let rayDir = normalize(camera.right * viewX + camera.up * viewY + camera.viewDir * viewZ);
  let cameraPos = camera.cameraPos;
  
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
