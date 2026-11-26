import {
	MILKY_WAY_TILE_COUNT,
	MILKY_WAY_TILE_SIZE,
	tileLevelOffset,
} from "~/domain/milky-way-format";

/**
 * GPU に置くタイルの最大数。1 枚 256KB なので全体で 48MB になる。
 * 1920×1080 の画面では要るタイルが最大でも約 100 枚で収まる。それより大きな画面では最大 300 枚ほど要ることがあり、
 * 優先度の低い画面の端の細かいタイルは置かず、粗いレベルで代わりに描く。
 */
export const MILKY_WAY_ATLAS_LAYERS = 192;

const PAGE_TABLE_ENTRY_BYTES = 4;
const NOT_LOADED = -1;

/** 通し番号がこれより小さいタイルは最も粗いレベルの面全体で、細かいタイルが届くまでの代わりになる */
const PINNED_TILE_COUNT = tileLevelOffset(1);

/**
 * 読み込んだ天の川のタイルを置くテクスチャ配列と、タイルの通し番号から層を引くページテーブル。
 * 層が埋まったら、最後に使ってから最も時間が経ったタイルを追い出す。最も粗いレベルのタイルは追い出さない。
 */
export class MilkyWayAtlas {
	readonly texture: GPUTexture;
	readonly pageTable: GPUBuffer;
	readonly #device: GPUDevice;
	/** 層ごとに置いているタイルの通し番号 */
	readonly #layerTiles = new Int32Array(MILKY_WAY_ATLAS_LAYERS).fill(NOT_LOADED);
	/** 層ごとに、置いたタイルを最後に使った世代 */
	readonly #layerLastUsed = new Float64Array(MILKY_WAY_ATLAS_LAYERS);
	readonly #tileLayers = new Map<number, number>();
	#generation = 0;

	constructor(device: GPUDevice) {
		this.#device = device;
		this.texture = device.createTexture({
			label: "Milky Way atlas",
			size: {
				width: MILKY_WAY_TILE_SIZE,
				height: MILKY_WAY_TILE_SIZE,
				depthOrArrayLayers: MILKY_WAY_ATLAS_LAYERS,
			},
			// タイル画像は sRGB で符号化してあり、線形に戻してから補間する
			format: "rgba8unorm-srgb",
			usage:
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.RENDER_ATTACHMENT,
		});
		this.pageTable = device.createBuffer({
			label: "Milky Way page table",
			size: MILKY_WAY_TILE_COUNT * PAGE_TABLE_ENTRY_BYTES,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
	}

	has(tileIndex: number): boolean {
		return this.#tileLayers.has(tileIndex);
	}

	/** 画面に要るタイルを、追い出しの対象から外す */
	markUsed(tileIndices: Iterable<number>): void {
		this.#generation += 1;
		for (const tileIndex of tileIndices) {
			const layer = this.#tileLayers.get(tileIndex);
			if (layer != null) {
				this.#layerLastUsed[layer] = this.#generation;
			}
		}
	}

	/**
	 * 今の画面に要るタイルを、空いた層か今の画面で使っていない層に置く。
	 * 要るタイルを層の数までに絞って渡せば、置き場所は必ず見つかる。
	 */
	upload(tileIndex: number, image: ImageBitmap): void {
		const layer = this.#findLayer();
		if (layer == null) {
			throw new Error("Milky Way atlas has no layer that the current view does not use.");
		}

		const evicted = this.#layerTiles[layer] ?? NOT_LOADED;
		if (evicted !== NOT_LOADED) {
			this.#tileLayers.delete(evicted);
			this.#writePageTableEntry(evicted, 0);
		}

		this.#device.queue.copyExternalImageToTexture(
			{ source: image },
			{ texture: this.texture, origin: { x: 0, y: 0, z: layer } },
			{ width: MILKY_WAY_TILE_SIZE, height: MILKY_WAY_TILE_SIZE },
		);
		this.#layerTiles[layer] = tileIndex;
		this.#layerLastUsed[layer] = this.#generation;
		this.#tileLayers.set(tileIndex, layer);
		this.#writePageTableEntry(tileIndex, layer + 1);
	}

	destroy(): void {
		this.texture.destroy();
		this.pageTable.destroy();
	}

	#findLayer(): number | null {
		let oldestLayer: number | null = null;
		let oldestGeneration = this.#generation;

		for (let layer = 0; layer < MILKY_WAY_ATLAS_LAYERS; layer += 1) {
			const tileIndex = this.#layerTiles[layer] ?? NOT_LOADED;
			if (tileIndex === NOT_LOADED) {
				return layer;
			}
			if (tileIndex < PINNED_TILE_COUNT) {
				continue;
			}

			const lastUsed = this.#layerLastUsed[layer] ?? 0;
			if (lastUsed < oldestGeneration) {
				oldestLayer = layer;
				oldestGeneration = lastUsed;
			}
		}

		return oldestLayer;
	}

	#writePageTableEntry(tileIndex: number, value: number): void {
		this.#device.queue.writeBuffer(
			this.pageTable,
			tileIndex * PAGE_TABLE_ENTRY_BYTES,
			new Uint32Array([value]),
		);
	}
}
