/**
 * 背景（光害グラデーション）シェーダー
 */

import { fullscreenQuadVertex } from "./common";

export const backgroundShaderCode = /* wgsl */ `
@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct CameraUniforms {
  altitude: f32,     // 視線の高度角 (ラジアン)
  fov: f32,          // 視野角 (ラジアン)
  aspect: f32,       // アスペクト比
  padding: f32,
}

${fullscreenQuadVertex}

// 街明かりの光害効果を計算
fn calculateSkyglow(pixelAltitude: f32) -> vec3f {
  // 地平線は暗く、少し上が最も明るい（光害のドーム）
  // pixelAltitude: そのピクセルが見ている高度角（ラジアン）
  
  // 高度を度に変換
  let altDeg = pixelAltitude * 57.2957795; // rad to deg
  
  // 光害のプロファイル:
  // - シルエット（0度）より下から徐々に減衰開始（シルエットに隠れる）
  // - 5-15度: 最も明るい（街明かりが空に反射）
  // - それ以上: 徐々に減衰
  
  // 地平線より下で徐々に減衰（シルエットより少し下から）
  // -5度で完全に暗く、0度付近で光害が見え始める
  let horizonFade = smoothstep(-5.0, 2.0, altDeg);
  
  // 光害のピーク（8度付近が最大）
  let peakAlt = 8.0;
  let glowFalloff = exp(-pow((altDeg - peakAlt) / 18.0, 2.0));
  
  // 高高度での急速な減衰
  let highAltFalloff = smoothstep(60.0, 20.0, altDeg);
  
  // 最終的な光害の強度
  let glowIntensity = horizonFade * glowFalloff * highAltFalloff * 0.15;
  
  // 光害の色（都市の青白い光）
  let glowColor = vec3f(0.4, 0.5, 0.8);
  
  return glowColor * glowIntensity;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // このピクセルが見ている高度を計算
  // UV座標から視線方向を再構築
  let screenY = (0.5 - input.uv.y) * 2.0; // -1 to 1 (上が正)
  let verticalAngle = atan(screenY * tan(camera.fov * 0.5));
  let pixelAltitude = camera.altitude + verticalAngle;
  
  // 街明かりの光害を計算
  let skyglow = calculateSkyglow(pixelAltitude);
  
  // 夜空の背景色（深い青）+ 光害
  let baseSkyColor = vec3f(0.0, 0.0, 0.02);
  let color = baseSkyColor + skyglow;
  
  return vec4f(color, 1.0);
}
`;
