import type { ViewBasis } from "~/domain/view";

/** shared.wgsl.ts の Scene 構造体のサイズ（16バイト境界に切り上げ） */
export const SCENE_UNIFORMS_BYTES = 80;

/**
 * Scene 構造体の並びで値を詰める。vec3f の後ろの4バイトにはスカラーを詰めて隙間を作らない。
 */
export function packSceneUniforms(
	view: ViewBasis,
	latitudeRad: number,
	localSiderealTime: number,
): Float32Array<ArrayBuffer> {
	return new Float32Array([
		...view.viewDir,
		latitudeRad,
		...view.right,
		localSiderealTime,
		...view.up,
		view.aspect,
		...view.position,
		view.tanHalfFov,
		view.projectionScale,
		view.cullRadius,
		0,
		0,
	]);
}
