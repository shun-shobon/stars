import { CatalogLoadError } from "~/catalog/fetch-catalog-file";
import { ObserverTimeError } from "~/domain/observer";
import { GpuDeviceLostError, GpuUnavailableError, GpuValidationError } from "~/renderer/gpu-canvas";

export type ErrorDescription = {
	/** 利用者に向けた説明 */
	message: string;
	/** 開発者が原因を追うための元のメッセージ */
	detail: string;
};

export function describeError(error: unknown): ErrorDescription {
	const detail = error instanceof Error ? error.message : String(error);

	if (error instanceof GpuUnavailableError) {
		return { message: "WebGPU で使える GPU が見つかりませんでした。", detail };
	}
	if (error instanceof GpuDeviceLostError) {
		return { message: "GPU との接続が切れました。ページを再読み込みしてください。", detail };
	}
	if (error instanceof GpuValidationError) {
		return { message: "GPU での描画に失敗しました。", detail };
	}
	if (error instanceof ObserverTimeError) {
		return { message: "指定した日時は表示できません。", detail };
	}
	if (error instanceof CatalogLoadError) {
		return { message: "星のデータを読み込めませんでした。", detail };
	}
	return { message: "星空の描画に失敗しました。", detail };
}
