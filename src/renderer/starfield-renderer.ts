import { CONSTELLATION_LINE_RECORD_BYTES, STAR_RECORD_BYTES } from "~/domain/catalog-format";
import { OBSERVER } from "~/domain/observer";
import type { ViewBasis } from "~/domain/view";

import type { GpuCanvas } from "./gpu-canvas";
import { GpuDeviceLostError, GpuValidationError, setUpGpuCanvas } from "./gpu-canvas";
import { MilkyWayAtlas } from "./milky-way-atlas";
import type { Pipelines } from "./pipelines";
import { createPipelines } from "./pipelines";
import type { RenderTargets } from "./render-targets";
import { createRenderTargets } from "./render-targets";
import { packSceneUniforms, SCENE_UNIFORMS_BYTES } from "./scene-uniforms";
import { createSkylineTexture } from "./skyline-texture";

/** 縦横のブラーを重ねる回数。回数を増やすほどにじみが広がる */
const BLOOM_BLUR_ITERATIONS = 4;

const FULLSCREEN_VERTEX_COUNT = 6;
const QUAD_VERTEX_COUNT = 4;

export type StarfieldRendererOptions = {
	starCount: number;
	constellationLineCount: number;
	faintestMagnitude: number;
	/** デバイスの喪失や GPU が拒否した処理を、生成後に知らせる */
	onError: (error: GpuDeviceLostError | GpuValidationError) => void;
};

export type RenderFrame = {
	/** canvas の縦横比で計算したカメラ */
	view: ViewBasis;
	localSiderealTime: number;
	areConstellationsVisible: boolean;
	isMilkyWayVisible: boolean;
};

export async function createStarfieldRenderer(
	canvas: HTMLCanvasElement,
	options: StarfieldRendererOptions,
	signal: AbortSignal,
): Promise<StarfieldRenderer> {
	const gpu = await setUpGpuCanvas(canvas, signal);
	return new StarfieldRenderer({ canvas, gpu, options });
}

/**
 * 背景、星座線、星をオフスクリーンに描き、ブルームとトーンマップをかけて canvas に出す。
 * 星と星座線のレコードは読み込みの進みに合わせて後から書き込み、書き込んだ分だけ描く。
 * 天の川は背景に描き、タイルは milkyWayAtlas に届いたものから使う。
 */
export class StarfieldRenderer {
	readonly milkyWayAtlas: MilkyWayAtlas;
	readonly #canvas: HTMLCanvasElement;
	readonly #device: GPUDevice;
	readonly #context: GPUCanvasContext;
	readonly #pipelines: Pipelines;
	readonly #sampler: GPUSampler;
	readonly #skylineTexture: GPUTexture;
	readonly #sceneBuffer: GPUBuffer;
	readonly #sceneBindGroups: Record<
		"background" | "constellation" | "star" | "composite",
		GPUBindGroup
	>;
	readonly #starBuffer: GPUBuffer;
	readonly #constellationBuffer: GPUBuffer;
	readonly #milkyWayBindGroup: GPUBindGroup;
	#renderTargets: RenderTargets | null = null;
	#writtenStarCount = 0;
	#writtenConstellationLineCount = 0;

	constructor({
		canvas,
		gpu,
		options,
	}: {
		canvas: HTMLCanvasElement;
		gpu: GpuCanvas;
		options: StarfieldRendererOptions;
	}) {
		const { device } = gpu;
		void device.lost.then((info) => {
			// dispose による破棄は失敗ではない
			if (info.reason !== "destroyed") {
				options.onError(new GpuDeviceLostError(`GPU device was lost: ${info.message}`));
			}
		});
		device.addEventListener("uncapturederror", (event) => {
			options.onError(new GpuValidationError(event.error.message));
		});

		this.#canvas = canvas;
		this.#device = device;
		this.#context = gpu.context;
		this.#pipelines = createPipelines(device, {
			canvasFormat: gpu.format,
			isHdr: gpu.isHdr,
			faintestMagnitude: options.faintestMagnitude,
		});
		this.#sampler = device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
		});
		this.#skylineTexture = createSkylineTexture(device);

		this.#sceneBuffer = device.createBuffer({
			label: "Scene uniforms",
			size: SCENE_UNIFORMS_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const createSceneBindGroup = (pipeline: GPURenderPipeline): GPUBindGroup =>
			device.createBindGroup({
				layout: pipeline.getBindGroupLayout(0),
				entries: [{ binding: 0, resource: { buffer: this.#sceneBuffer } }],
			});
		this.#sceneBindGroups = {
			background: createSceneBindGroup(this.#pipelines.background),
			constellation: createSceneBindGroup(this.#pipelines.constellation),
			star: createSceneBindGroup(this.#pipelines.star),
			composite: createSceneBindGroup(this.#pipelines.composite),
		};

		this.#starBuffer = device.createBuffer({
			label: "Stars",
			size: options.starCount * STAR_RECORD_BYTES,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.#constellationBuffer = device.createBuffer({
			label: "Constellation lines",
			size: options.constellationLineCount * CONSTELLATION_LINE_RECORD_BYTES,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});

		this.milkyWayAtlas = new MilkyWayAtlas(device);
		this.#milkyWayBindGroup = device.createBindGroup({
			layout: this.#pipelines.background.getBindGroupLayout(1),
			entries: [
				{ binding: 0, resource: this.milkyWayAtlas.texture.createView({ dimension: "2d-array" }) },
				{ binding: 1, resource: this.#sampler },
				{ binding: 2, resource: { buffer: this.milkyWayAtlas.pageTable } },
			],
		});
	}

	/** 星のレコードを書き込む。先頭から途切れずに書き込まれた分を描画対象にする */
	writeStarRecords(records: Uint8Array<ArrayBuffer>, byteOffset: number): void {
		this.#device.queue.writeBuffer(this.#starBuffer, byteOffset, records);
		this.#writtenStarCount = (byteOffset + records.byteLength) / STAR_RECORD_BYTES;
	}

	writeConstellationLineRecords(records: Uint8Array<ArrayBuffer>): void {
		this.#device.queue.writeBuffer(this.#constellationBuffer, 0, records);
		this.#writtenConstellationLineCount = records.byteLength / CONSTELLATION_LINE_RECORD_BYTES;
	}

	render({
		view,
		localSiderealTime,
		areConstellationsVisible,
		isMilkyWayVisible,
	}: RenderFrame): void {
		const { width, height } = this.#canvas;
		// レイアウト前など canvas の面積が 0 のときは描く先がない
		if (width === 0 || height === 0) {
			return;
		}

		const targets = this.#resizeRenderTargets(width, height);
		this.#device.queue.writeBuffer(
			this.#sceneBuffer,
			0,
			packSceneUniforms(view, OBSERVER.latitudeRad, localSiderealTime, isMilkyWayVisible ? 1 : 0),
		);

		const encoder = this.#device.createCommandEncoder();
		const pipelines = this.#pipelines;

		const backgroundPass = beginPass(encoder, targets.sceneView, "clear");
		backgroundPass.setPipeline(pipelines.background);
		backgroundPass.setBindGroup(0, this.#sceneBindGroups.background);
		backgroundPass.setBindGroup(1, this.#milkyWayBindGroup);
		backgroundPass.draw(FULLSCREEN_VERTEX_COUNT);
		backgroundPass.end();

		// 星の光を遮らないよう、星座線は星より先に描く
		if (areConstellationsVisible && this.#writtenConstellationLineCount > 0) {
			const constellationPass = beginPass(encoder, targets.sceneView, "load");
			constellationPass.setPipeline(pipelines.constellation);
			constellationPass.setBindGroup(0, this.#sceneBindGroups.constellation);
			constellationPass.setVertexBuffer(0, this.#constellationBuffer);
			constellationPass.draw(QUAD_VERTEX_COUNT, this.#writtenConstellationLineCount);
			constellationPass.end();
		}

		const starPass = beginPass(encoder, targets.sceneView, "load");
		starPass.setPipeline(pipelines.star);
		starPass.setBindGroup(0, this.#sceneBindGroups.star);
		starPass.setVertexBuffer(0, this.#starBuffer);
		starPass.draw(QUAD_VERTEX_COUNT, this.#writtenStarCount);
		starPass.end();

		drawFullscreen(encoder, targets.bloomView, pipelines.brightPass, [targets.brightPassBindGroup]);
		for (let iteration = 0; iteration < BLOOM_BLUR_ITERATIONS; iteration += 1) {
			drawFullscreen(encoder, targets.bloomScratchView, pipelines.blurHorizontal, [
				targets.blurHorizontalBindGroup,
			]);
			drawFullscreen(encoder, targets.bloomView, pipelines.blurVertical, [
				targets.blurVerticalBindGroup,
			]);
		}
		drawFullscreen(encoder, this.#context.getCurrentTexture().createView(), pipelines.composite, [
			this.#sceneBindGroups.composite,
			targets.compositeBindGroup,
		]);

		this.#device.queue.submit([encoder.finish()]);
	}

	dispose(): void {
		this.#context.unconfigure();
		this.#renderTargets?.destroy();
		this.#skylineTexture.destroy();
		this.milkyWayAtlas.destroy();
		this.#sceneBuffer.destroy();
		this.#starBuffer.destroy();
		this.#constellationBuffer.destroy();
		this.#device.destroy();
	}

	#resizeRenderTargets(width: number, height: number): RenderTargets {
		const current = this.#renderTargets;
		if (current?.width === width && current.height === height) {
			return current;
		}

		current?.destroy();
		const targets = createRenderTargets({
			device: this.#device,
			pipelines: this.#pipelines,
			sampler: this.#sampler,
			skylineView: this.#skylineTexture.createView(),
			width,
			height,
		});
		this.#renderTargets = targets;
		return targets;
	}
}

function beginPass(
	encoder: GPUCommandEncoder,
	view: GPUTextureView,
	loadOp: GPULoadOp,
): GPURenderPassEncoder {
	return encoder.beginRenderPass({
		colorAttachments: [{ view, loadOp, storeOp: "store", clearValue: [0, 0, 0, 1] }],
	});
}

function drawFullscreen(
	encoder: GPUCommandEncoder,
	view: GPUTextureView,
	pipeline: GPURenderPipeline,
	bindGroups: GPUBindGroup[],
): void {
	const pass = beginPass(encoder, view, "clear");
	pass.setPipeline(pipeline);
	for (const [index, bindGroup] of bindGroups.entries()) {
		pass.setBindGroup(index, bindGroup);
	}
	pass.draw(FULLSCREEN_VERTEX_COUNT);
	pass.end();
}
