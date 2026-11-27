/**
 * OpenEXR のスキャンライン画像から RGB を読む。天の川の元画像が使う形式（half の R・G・B、無圧縮か ZIP）だけを扱う。
 */

import { inflateSync } from "node:zlib";

export type ExrImage = {
	width: number;
	height: number;
	/** 画素ごとに R・G・B の順で並べた half float のビット列。上の行から並ぶ */
	rgb: Uint16Array;
};

const MAGIC = 20000630;
const HALF_BYTES = 2;
const PIXEL_TYPE_HALF = 1;

const LINES_PER_BLOCK: Record<number, number> = {
	0: 1, // NO_COMPRESSION
	2: 1, // ZIPS_COMPRESSION
	3: 16, // ZIP_COMPRESSION
};

type Channel = { name: string; pixelType: number };

export function decodeExr(file: Buffer): ExrImage {
	if (file.readInt32LE(0) !== MAGIC) {
		throw new Error("Not an OpenEXR file.");
	}
	const versionFlags = file.readInt32LE(4);
	// bit 9 がタイル画像、bit 12 がマルチパート
	if ((versionFlags & 0x1200) !== 0) {
		throw new Error("Only single-part scanline OpenEXR images are supported.");
	}

	const { attributes, end } = readHeader(file, 8);
	const channels = parseChannels(requireAttribute(attributes, "channels"));
	const compression = requireAttribute(attributes, "compression").readUInt8(0);
	const dataWindow = requireAttribute(attributes, "dataWindow");
	const width = dataWindow.readInt32LE(8) - dataWindow.readInt32LE(0) + 1;
	const height = dataWindow.readInt32LE(12) - dataWindow.readInt32LE(4) + 1;
	const yMin = dataWindow.readInt32LE(4);

	const linesPerBlock = LINES_PER_BLOCK[compression];
	if (linesPerBlock == null) {
		throw new Error(`Unsupported OpenEXR compression ${compression}.`);
	}
	const channelOrder = ["R", "G", "B"].map((name) => {
		const index = channels.findIndex((channel) => channel.name === name);
		if (index === -1 || channels[index]?.pixelType !== PIXEL_TYPE_HALF) {
			throw new Error(`OpenEXR channel ${name} must exist as half float.`);
		}
		return index;
	});

	const rgb = new Uint16Array(width * height * 3);
	const blockCount = Math.ceil(height / linesPerBlock);
	const scanlineBytes = width * HALF_BYTES * channels.length;

	for (let block = 0; block < blockCount; block += 1) {
		const offset = Number(file.readBigUInt64LE(end + block * 8));
		const firstLine = file.readInt32LE(offset) - yMin;
		const packedBytes = file.readInt32LE(offset + 4);
		const lineCount = Math.min(linesPerBlock, height - firstLine);
		const rawBytes = lineCount * scanlineBytes;
		const packed = file.subarray(offset + 8, offset + 8 + packedBytes);
		// 圧縮しても小さくならないブロックは、圧縮せずに格納される
		const raw = packedBytes === rawBytes || compression === 0 ? packed : unzipBlock(packed);
		if (raw.length !== rawBytes) {
			throw new Error(`OpenEXR block ${block} has ${raw.length} bytes, expected ${rawBytes}.`);
		}

		for (let line = 0; line < lineCount; line += 1) {
			const lineStart = line * scanlineBytes;
			const outputRow = (firstLine + line) * width * 3;
			for (const [component, channelIndex] of channelOrder.entries()) {
				const channelStart = lineStart + channelIndex * width * HALF_BYTES;
				for (let x = 0; x < width; x += 1) {
					rgb[outputRow + x * 3 + component] = raw.readUInt16LE(channelStart + x * HALF_BYTES);
				}
			}
		}
	}

	return { width, height, rgb };
}

/** half float のビット列を数値に直す表 */
export const HALF_TO_FLOAT: Float32Array = (() => {
	const table = new Float32Array(65536);
	for (let bits = 0; bits < 65536; bits += 1) {
		const sign = (bits & 0x8000) === 0 ? 1 : -1;
		const exponent = (bits >> 10) & 0x1f;
		const mantissa = bits & 0x3ff;
		if (exponent === 0) {
			table[bits] = sign * 2 ** -14 * (mantissa / 1024);
		} else if (exponent === 31) {
			table[bits] = mantissa === 0 ? sign * Infinity : Number.NaN;
		} else {
			table[bits] = sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
		}
	}
	return table;
})();

function readHeader(file: Buffer, start: number): { attributes: Map<string, Buffer>; end: number } {
	const attributes = new Map<string, Buffer>();
	let position = start;

	while (file[position] !== 0) {
		const name = readNullTerminated(file, position);
		position += name.length + 1;
		const type = readNullTerminated(file, position);
		position += type.length + 1;
		const size = file.readInt32LE(position);
		position += 4;
		attributes.set(name, file.subarray(position, position + size));
		position += size;
	}

	return { attributes, end: position + 1 };
}

function parseChannels(value: Buffer): Channel[] {
	const channels: Channel[] = [];
	let position = 0;

	while (value[position] !== 0) {
		const name = readNullTerminated(value, position);
		position += name.length + 1;
		channels.push({ name, pixelType: value.readInt32LE(position) });
		// pixelType, pLinear と予約3バイト, xSampling, ySampling
		position += 16;
	}

	return channels;
}

/**
 * ZIP 圧縮のブロックを戻す。OpenEXR は deflate の前に、バイトを偶数番目と奇数番目に分けて並べ、隣との差分を取っている。
 */
function unzipBlock(packed: Buffer): Buffer {
	const predicted = inflateSync(packed);
	for (let index = 1; index < predicted.length; index += 1) {
		predicted[index] = (predicted[index - 1]! + predicted[index]! - 128) & 0xff;
	}

	const raw = Buffer.alloc(predicted.length);
	const half = Math.ceil(predicted.length / 2);
	for (let index = 0; index < predicted.length; index += 1) {
		raw[index] = index % 2 === 0 ? predicted[index / 2]! : predicted[half + (index - 1) / 2]!;
	}
	return raw;
}

function requireAttribute(attributes: Map<string, Buffer>, name: string): Buffer {
	const value = attributes.get(name);
	if (value == null) {
		throw new Error(`OpenEXR header has no ${name} attribute.`);
	}
	return value;
}

function readNullTerminated(buffer: Buffer, start: number): string {
	const end = buffer.indexOf(0, start);
	return buffer.toString("latin1", start, end);
}
