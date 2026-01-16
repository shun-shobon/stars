/**
 * Hipparcos星カタログを前処理し、WebGPU用のバイナリデータを生成する
 *
 * 出力フォーマット:
 *
 * - Stars.bin: Float32Array (赤経rad, 赤緯rad, 等級, B-V色指数) x 星の数
 * - Stars-meta.json: メタデータ (星の数、等級の範囲)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

interface StarData {
	ra: number; // 赤経 (ラジアン)
	dec: number; // 赤緯 (ラジアン)
	mag: number; // 視等級
	bv: number; // B-V色指数
}

async function processHipparcosData(): Promise<void> {
	const inputPath = path.resolve(
		import.meta.dirname,
		"../hipparcos-voidmain.csv",
	);
	const binaryOutputDir = path.resolve(import.meta.dirname, "../public");
	const metaOutputDir = path.resolve(import.meta.dirname, "../src/data");

	// 出力ディレクトリ作成
	if (!fs.existsSync(binaryOutputDir)) {
		fs.mkdirSync(binaryOutputDir, { recursive: true });
	}
	if (!fs.existsSync(metaOutputDir)) {
		fs.mkdirSync(metaOutputDir, { recursive: true });
	}

	const stars: StarData[] = [];
	let minMag = Infinity;
	let maxMag = -Infinity;
	let minBV = Infinity;
	let maxBV = -Infinity;

	const fileStream = fs.createReadStream(inputPath);
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity,
	});

	let isFirstLine = true;
	let raIndex = -1;
	let decIndex = -1;
	let magIndex = -1;
	let bvIndex = -1;

	for await (const line of rl) {
		if (isFirstLine) {
			// ヘッダー行からカラムインデックスを取得
			const headers = line.split(",");
			raIndex = headers.indexOf("RAdeg");
			decIndex = headers.indexOf("DEdeg");
			magIndex = headers.indexOf("Vmag");
			bvIndex = headers.indexOf("B-V");
			isFirstLine = false;
			continue;
		}

		const columns = line.split(",");

		// 赤経 (度) -> ラジアン
		const raStr = columns[raIndex];
		const decStr = columns[decIndex];
		const magStr = columns[magIndex];
		const bvStr = columns[bvIndex];

		// 無効なデータをスキップ
		if (raStr === undefined || decStr === undefined || magStr === undefined) {
			continue;
		}

		const raDeg = Number.parseFloat(raStr);
		// 赤緯 (度) -> ラジアン
		const decDeg = Number.parseFloat(decStr);
		// 視等級
		const mag = Number.parseFloat(magStr);
		// B-V色指数 (欠損の場合は0.65 = G型星のデフォルト)
		const bv =
			bvStr !== undefined && bvStr !== "" ? Number.parseFloat(bvStr) : 0.65;

		// 無効なデータをスキップ
		if (Number.isNaN(raDeg) || Number.isNaN(decDeg) || Number.isNaN(mag)) {
			continue;
		}

		const ra = (raDeg * Math.PI) / 180;
		const dec = (decDeg * Math.PI) / 180;

		// B-Vが無効な場合はデフォルト値を使用
		const validBV = Number.isNaN(bv) ? 0.65 : bv;

		stars.push({ ra, dec, mag, bv: validBV });

		minMag = Math.min(minMag, mag);
		maxMag = Math.max(maxMag, mag);
		if (!Number.isNaN(bv)) {
			minBV = Math.min(minBV, bv);
			maxBV = Math.max(maxBV, bv);
		}
	}

	console.log(`処理した星の数: ${stars.length.toString()}`);
	console.log(`等級範囲: ${minMag.toString()} ~ ${maxMag.toString()}`);
	console.log(`B-V色指数範囲: ${minBV.toString()} ~ ${maxBV.toString()}`);

	// 等級順にソート（明るい星 = 小さい等級が先）
	stars.sort((a, b) => a.mag - b.mag);
	console.log("等級順にソート完了");

	// バイナリデータ作成 (ra, dec, mag, bv を Float32 で格納)
	const buffer = new ArrayBuffer(stars.length * 4 * 4); // 4 floats per star
	const view = new Float32Array(buffer);

	for (const [i, star] of stars.entries()) {
		view[i * 4] = star.ra;
		view[i * 4 + 1] = star.dec;
		view[i * 4 + 2] = star.mag;
		view[i * 4 + 3] = star.bv;
	}

	// バイナリファイル書き込み
	const binaryPath = path.join(binaryOutputDir, "stars.bin");
	fs.writeFileSync(binaryPath, Buffer.from(buffer));
	console.log(`バイナリデータを保存: ${binaryPath}`);

	// メタデータ書き込み
	const metaPath = path.join(metaOutputDir, "stars-meta.json");
	const meta = {
		starCount: stars.length,
		minMagnitude: minMag,
		maxMagnitude: maxMag,
		minBV: minBV,
		maxBV: maxBV,
	};
	fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
	console.log(`メタデータを保存: ${metaPath}`);

	// ファイルサイズを表示
	const stats = fs.statSync(binaryPath);
	console.log(
		`バイナリファイルサイズ: ${(stats.size / 1024).toFixed(2).toString()} KB`,
	);
}

processHipparcosData().catch(console.error);
