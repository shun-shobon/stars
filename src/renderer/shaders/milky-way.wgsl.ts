import type { CubeFace } from "~/domain/milky-way-format";
import {
	CUBE_FACE_COUNT,
	CUBE_FACES,
	MILKY_WAY_MAX_LEVEL,
	MILKY_WAY_TILE_BORDER,
	MILKY_WAY_TILE_CONTENT,
	MILKY_WAY_TILE_SIZE,
} from "~/domain/milky-way-format";
import { MILKY_WAY_LOD_BIAS } from "~/domain/milky-way-tiles";

const cubeFaceAxes = (axis: keyof CubeFace): string =>
	`array<vec3f, ${CUBE_FACE_COUNT}>(${CUBE_FACES.map(
		(face) => `vec3f(${face[axis].map((component) => component.toFixed(1)).join(", ")})`,
	).join(", ")})`;

/**
 * 天の川のタイルをアトラスから引く関数群。タイルの形式は domain/milky-way-format.ts、
 * レベルの選び方は domain/milky-way-tiles.ts と同じ計算にする。Scene の uniform が要る。
 */
export const MILKY_WAY_WGSL = /* wgsl */ `
const MILKY_WAY_TILE_SIZE = ${MILKY_WAY_TILE_SIZE}.0;
const MILKY_WAY_TILE_BORDER = ${MILKY_WAY_TILE_BORDER}.0;
const MILKY_WAY_TILE_CONTENT = ${MILKY_WAY_TILE_CONTENT}.0;
const MILKY_WAY_MAX_LEVEL = ${MILKY_WAY_MAX_LEVEL}u;
const MILKY_WAY_LOD_BIAS = ${MILKY_WAY_LOD_BIAS};
const CUBE_FACE_NORMALS = ${cubeFaceAxes("normal")};
const CUBE_FACE_TANGENTS_U = ${cubeFaceAxes("tangentU")};
const CUBE_FACE_TANGENTS_V = ${cubeFaceAxes("tangentV")};

// 読み込んだタイルを層ごとに1枚ずつ持つ
@group(1) @binding(0) var milkyWayAtlas: texture_2d_array<f32>;
@group(1) @binding(1) var milkyWaySampler: sampler;
// タイルの通し番号ごとに、そのタイルを置いた層の番号 + 1。0 はまだ読み込んでいない
@group(1) @binding(2) var<storage, read> milkyWayPageTable: array<u32>;

struct MilkyWayPosition {
  face: u32,
  // 面上の位置。面の中心が 0 で、辺が ±1
  uv: vec2f,
  lod: f32,
}

// 地平座標（東 +X、天頂 +Y、北 +Z）の方向を、赤道座標（赤経 0h +X、赤経 6h +Y、天の北極 +Z）の方向に変える
fn horizontalToEquatorial(direction: vec3f) -> vec3f {
  let sinLatitude = sin(scene.latitude);
  let cosLatitude = cos(scene.latitude);

  // 子午線上の天の赤道、西の地平線、天の北極の3方向の成分
  let towardMeridian = cosLatitude * direction.y - sinLatitude * direction.z;
  let towardWest = -direction.x;
  let towardPole = cosLatitude * direction.z + sinLatitude * direction.y;

  // 赤経 = 地方恒星時 - 時角
  let cosLst = cos(scene.localSiderealTime);
  let sinLst = sin(scene.localSiderealTime);
  return vec3f(
    cosLst * towardMeridian + sinLst * towardWest,
    sinLst * towardMeridian - cosLst * towardWest,
    towardPole,
  );
}

fn cubeFaceOf(direction: vec3f) -> u32 {
  let magnitude = abs(direction);
  if (magnitude.x >= magnitude.y && magnitude.x >= magnitude.z) {
    return select(1u, 0u, direction.x >= 0.0);
  }
  if (magnitude.y >= magnitude.z) {
    return select(3u, 2u, direction.y >= 0.0);
  }
  return select(5u, 4u, direction.z >= 0.0);
}

// 画面上の微分を使うので、一様な制御フローから呼ぶ
fn milkyWayPosition(equatorial: vec3f) -> MilkyWayPosition {
  let directionPerPixelX = dpdx(equatorial);
  let directionPerPixelY = dpdy(equatorial);

  let face = cubeFaceOf(equatorial);
  let normal = CUBE_FACE_NORMALS[face];
  let tangentU = CUBE_FACE_TANGENTS_U[face];
  let tangentV = CUBE_FACE_TANGENTS_V[face];
  let depth = dot(equatorial, normal);
  let uv = vec2f(dot(equatorial, tangentU), dot(equatorial, tangentV)) / depth;

  // uv を画面上で微分すると面の境界で跳ぶので、連続な方向の微分に投影の偏微分を掛けて求める
  let uvPerDirectionU = (tangentU - uv.x * normal) / depth;
  let uvPerDirectionV = (tangentV - uv.y * normal) / depth;
  let uvPerPixelX = vec2f(dot(directionPerPixelX, uvPerDirectionU), dot(directionPerPixelX, uvPerDirectionV));
  let uvPerPixelY = vec2f(dot(directionPerPixelY, uvPerDirectionU), dot(directionPerPixelY, uvPerDirectionV));
  let faceUnitsPerPixel = max(length(uvPerPixelX), length(uvPerPixelY));

  let lod = log2(2.0 / (MILKY_WAY_TILE_CONTENT * faceUnitsPerPixel)) - MILKY_WAY_LOD_BIAS;
  return MilkyWayPosition(face, uv, clamp(lod, 0.0, f32(MILKY_WAY_MAX_LEVEL)));
}

fn tileLevelOffset(level: u32) -> u32 {
  return ${CUBE_FACE_COUNT}u * ((1u << (2u * level)) - 1u) / 3u;
}

// 求めたレベルのタイルがまだ届いていなければ、届いている粗いレベルで代える
fn sampleMilkyWayLevel(face: u32, uv: vec2f, level: u32) -> vec3f {
  for (var candidate = i32(level); candidate >= 0; candidate--) {
    let candidateLevel = u32(candidate);
    let tilesPerSide = 1u << candidateLevel;
    let position = vec2f(uv.x + 1.0, 1.0 - uv.y) * 0.5 * f32(tilesPerSide);
    let tile = min(vec2u(max(floor(position), vec2f(0.0))), vec2u(tilesPerSide - 1u));
    let index = tileLevelOffset(candidateLevel) + (face * tilesPerSide + tile.y) * tilesPerSide + tile.x;
    let layer = milkyWayPageTable[index];
    if (layer != 0u) {
      let inTile = clamp(position - vec2f(tile), vec2f(0.0), vec2f(1.0));
      let texel = (MILKY_WAY_TILE_BORDER + inTile * MILKY_WAY_TILE_CONTENT) / MILKY_WAY_TILE_SIZE;
      return textureSampleLevel(milkyWayAtlas, milkyWaySampler, texel, layer - 1u, 0.0).rgb;
    }
  }
  return vec3f(0.0);
}

// 線形の放射輝度。小数のレベルの前後2つを混ぜ、ズーム中にレベルが切り替わる境目を目立たせない
fn milkyWayRadiance(equatorial: vec3f) -> vec3f {
  let position = milkyWayPosition(equatorial);
  let coarser = floor(position.lod);
  let finer = min(u32(coarser) + 1u, MILKY_WAY_MAX_LEVEL);
  return mix(
    sampleMilkyWayLevel(position.face, position.uv, u32(coarser)),
    sampleMilkyWayLevel(position.face, position.uv, finer),
    position.lod - coarser,
  );
}
`;
