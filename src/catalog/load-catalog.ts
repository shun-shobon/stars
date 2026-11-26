import { CONSTELLATION_LINE_RECORD_BYTES, STAR_RECORD_BYTES } from "~/domain/catalog-format";

import catalogMeta from "./catalog-meta.json";

/**
 * 生成スクリプトが書き出したカタログの件数と、最も暗い星の等級。
 */
export const CATALOG: {
	starCount: number;
	faintestMagnitude: number;
	constellationLineCount: number;
} = catalogMeta;

export class CatalogLoadError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "CatalogLoadError";
	}
}

/**
 * 星のレコードを届いた分から順に渡す。塊はレコードの境界で区切り、ファイル先頭からのバイト位置を添える。
 * 星は明るい順に並んでいるので、受け取った分だけ描けば明るい星から現れる。
 */
export async function streamStarRecords(
	onRecords: (records: Uint8Array<ArrayBuffer>, byteOffset: number) => void,
	signal: AbortSignal,
): Promise<void> {
	const path = "/stars.bin";
	const expectedBytes = CATALOG.starCount * STAR_RECORD_BYTES;
	const response = await fetchCatalogFile(path, signal);
	if (response.body == null) {
		throw new CatalogLoadError(`Response for ${path} has no body.`);
	}

	const reader = response.body.getReader();
	let receivedBytes = 0;
	let pending = new Uint8Array(0);

	while (true) {
		const { done, value } = await failOnNetworkError(`Failed to read ${path}.`, () =>
			reader.read(),
		);
		if (done) {
			break;
		}

		const buffered = concat(pending, value);
		const alignedBytes = buffered.length - (buffered.length % STAR_RECORD_BYTES);
		if (receivedBytes + alignedBytes > expectedBytes) {
			throw new CatalogLoadError(`${path} is larger than ${expectedBytes} bytes.`);
		}

		if (alignedBytes > 0) {
			onRecords(buffered.subarray(0, alignedBytes), receivedBytes);
			receivedBytes += alignedBytes;
		}
		pending = buffered.slice(alignedBytes);
	}

	if (receivedBytes + pending.length !== expectedBytes) {
		throw new CatalogLoadError(
			`${path} has ${receivedBytes + pending.length} bytes, expected ${expectedBytes}.`,
		);
	}
}

export async function fetchConstellationLineRecords(
	signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
	const path = "/constellations.bin";
	const expectedBytes = CATALOG.constellationLineCount * CONSTELLATION_LINE_RECORD_BYTES;
	const response = await fetchCatalogFile(path, signal);
	const records = new Uint8Array(
		await failOnNetworkError(`Failed to read ${path}.`, () => response.arrayBuffer()),
	);

	if (records.length !== expectedBytes) {
		throw new CatalogLoadError(`${path} has ${records.length} bytes, expected ${expectedBytes}.`);
	}
	return records;
}

async function fetchCatalogFile(path: string, signal: AbortSignal): Promise<Response> {
	const response = await failOnNetworkError(`Failed to fetch ${path}.`, () =>
		fetch(path, { signal }),
	);
	if (!response.ok) {
		throw new CatalogLoadError(`Failed to fetch ${path}: HTTP ${response.status}.`);
	}
	return response;
}

/**
 * 通信の失敗（fetch が投げる TypeError）を CatalogLoadError にする。
 * 中断は呼び出し元が意図したものなので、そのまま伝える。
 */
async function failOnNetworkError<T>(message: string, operation: () => Promise<T>): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (!(error instanceof TypeError)) {
			throw error;
		}
		throw new CatalogLoadError(message, { cause: error });
	}
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
	const result = new Uint8Array(a.length + b.length);
	result.set(a);
	result.set(b, a.length);
	return result;
}
