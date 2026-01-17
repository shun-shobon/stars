/**
 * シルエット（建物スカイライン）シェーダー
 * 地平線以下を黒でマスクして、建物のシルエットを表現
 * 将来的にはノイズやテクスチャで複雑なスカイラインを表現可能
 */

import { fullscreenQuadVertex } from "./common";

export const silhouetteShaderCode = /* wgsl */ `
@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct CameraUniforms {
  altitude: f32,     // 視線の高度角 (ラジアン)
  fov: f32,          // 視野角 (ラジアン)
  aspect: f32,       // アスペクト比
  padding: f32,
}

${fullscreenQuadVertex}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // このピクセルが見ている高度を計算
  let screenY = (0.5 - input.uv.y) * 2.0; // -1 to 1 (上が正)
  let verticalAngle = atan(screenY * tan(camera.fov * 0.5));
  let pixelAltitude = camera.altitude + verticalAngle;
  
  // 高度を度に変換
  let altDeg = pixelAltitude * 57.2957795; // rad to deg
  
  // 地平線以下（0度以下）は黒でマスク
  // シャープなエッジで建物のシルエットを表現
  // 将来的にはここにノイズを追加してビルのスカイラインを表現可能
  let silhouetteHeight = 0.0; // 基本のシルエット高さ（度）
  
  if (altDeg < silhouetteHeight) {
    // シルエット領域：完全に黒
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  
  // シルエット領域外：透明（何も描画しない）
  discard;
  return vec4f(0.0, 0.0, 0.0, 0.0); // discardの後でも形式的にreturnが必要
}
`;
