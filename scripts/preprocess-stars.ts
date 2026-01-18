/**
 * Hipparcos星カタログを前処理し、WebGPU用のバイナリデータを生成する
 *
 * 出力フォーマット:
 *
 * - Stars.bin: Float32Array (赤経rad, 赤緯rad, 等級, B-V色指数) x 星の数
 * - Stars-meta.json: メタデータ (星の数、等級の範囲)
 * - Constellations.bin: Float32Array (ra1, dec1, ra2, dec2) x 線分の数
 * - Constellations-meta.json: メタデータ (線分の数)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

interface StarData {
	hip: number; // Hipparcos ID
	ra: number; // 赤経 (ラジアン)
	dec: number; // 赤緯 (ラジアン)
	mag: number; // 視等級
	bv: number; // B-V色指数
}

interface ConstellationLine {
	hip1: number;
	hip2: number;
}

interface ConstellationData {
	abbr: string;
	name: string;
	lines: ConstellationLine[];
}

interface ConstellationLinesJson {
	constellations: ConstellationData[];
	totalLines: number;
}

async function processHipparcosData(): Promise<void> {
	const inputPath = path.resolve(
		import.meta.dirname,
		"../data/hipparcos-voidmain.csv",
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
	const hipToStar = new Map<number, StarData>(); // HIP ID → 星データのマップ
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
	let hipIndex = -1;
	let raIndex = -1;
	let decIndex = -1;
	let magIndex = -1;
	let bvIndex = -1;

	for await (const line of rl) {
		if (isFirstLine) {
			// ヘッダー行からカラムインデックスを取得
			const headers = line.split(",");
			hipIndex = headers.indexOf("HIP");
			raIndex = headers.indexOf("RAdeg");
			decIndex = headers.indexOf("DEdeg");
			magIndex = headers.indexOf("Vmag");
			bvIndex = headers.indexOf("B-V");
			isFirstLine = false;
			continue;
		}

		const columns = line.split(",");

		// HIP ID
		const hipStr = columns[hipIndex];
		// 赤経 (度) -> ラジアン
		const raStr = columns[raIndex];
		const decStr = columns[decIndex];
		const magStr = columns[magIndex];
		const bvStr = columns[bvIndex];

		// 無効なデータをスキップ
		if (
			hipStr === undefined ||
			raStr === undefined ||
			decStr === undefined ||
			magStr === undefined
		) {
			continue;
		}

		const hip = Number.parseInt(hipStr, 10);
		const raDeg = Number.parseFloat(raStr);
		// 赤緯 (度) -> ラジアン
		const decDeg = Number.parseFloat(decStr);
		// 視等級
		const mag = Number.parseFloat(magStr);
		// B-V色指数 (欠損の場合は0.65 = G型星のデフォルト)
		const bv =
			bvStr !== undefined && bvStr !== "" ? Number.parseFloat(bvStr) : 0.65;

		// 無効なデータをスキップ
		if (
			Number.isNaN(hip) ||
			Number.isNaN(raDeg) ||
			Number.isNaN(decDeg) ||
			Number.isNaN(mag)
		) {
			continue;
		}

		const ra = (raDeg * Math.PI) / 180;
		const dec = (decDeg * Math.PI) / 180;

		// B-Vが無効な場合はデフォルト値を使用
		const validBV = Number.isNaN(bv) ? 0.65 : bv;

		const starData: StarData = { hip, ra, dec, mag, bv: validBV };
		stars.push(starData);
		hipToStar.set(hip, starData);

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

	// 星座線データの処理
	console.log("\n--- 星座線データの処理 ---");
	await processConstellationLines(hipToStar, binaryOutputDir, metaOutputDir);
}

/**
 * 星座線データを処理し、バイナリファイルを生成する
 */
async function processConstellationLines(
	hipToStar: Map<number, StarData>,
	binaryOutputDir: string,
	metaOutputDir: string,
): Promise<void> {
	const constellationLinesPath = path.resolve(
		import.meta.dirname,
		"../src/data/constellation-lines.json",
	);

	// 星座線JSONが存在しない場合はスキップ
	if (!fs.existsSync(constellationLinesPath)) {
		console.log(
			"星座線データが見つかりません。先にconvert-constellation-data.tsを実行してください。",
		);
		return;
	}

	const rawData = fs.readFileSync(constellationLinesPath, "utf-8");
	const constellationData: ConstellationLinesJson = JSON.parse(
		rawData,
	) as ConstellationLinesJson;

	// 有効な線分（両端の星が見つかる線分）を収集
	const validLines: Array<{
		ra1: number;
		dec1: number;
		ra2: number;
		dec2: number;
	}> = [];
	let missingStars = 0;

	for (const constellation of constellationData.constellations) {
		for (const line of constellation.lines) {
			const star1 = hipToStar.get(line.hip1);
			const star2 = hipToStar.get(line.hip2);

			if (star1 && star2) {
				validLines.push({
					ra1: star1.ra,
					dec1: star1.dec,
					ra2: star2.ra,
					dec2: star2.dec,
				});
			} else {
				missingStars++;
			}
		}
	}

	console.log(`有効な線分数: ${validLines.length.toString()}`);
	if (missingStars > 0) {
		console.log(
			`スキップした線分（星が見つからない）: ${missingStars.toString()}`,
		);
	}

	// バイナリデータ作成 (ra1, dec1, ra2, dec2 を Float32 で格納)
	const buffer = new ArrayBuffer(validLines.length * 4 * 4); // 4 floats per line
	const view = new Float32Array(buffer);

	for (const [i, line] of validLines.entries()) {
		view[i * 4] = line.ra1;
		view[i * 4 + 1] = line.dec1;
		view[i * 4 + 2] = line.ra2;
		view[i * 4 + 3] = line.dec2;
	}

	// バイナリファイル書き込み
	const binaryPath = path.join(binaryOutputDir, "constellations.bin");
	fs.writeFileSync(binaryPath, Buffer.from(buffer));
	console.log(`星座線バイナリを保存: ${binaryPath}`);

	// メタデータ書き込み
	const metaPath = path.join(metaOutputDir, "constellations-meta.json");
	const meta = {
		lineCount: validLines.length,
		constellationCount: constellationData.constellations.length,
	};
	fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
	console.log(`星座線メタデータを保存: ${metaPath}`);

	// ファイルサイズを表示
	const constellationStats = fs.statSync(binaryPath);
	console.log(
		`星座線バイナリサイズ: ${(constellationStats.size / 1024).toFixed(2).toString()} KB`,
	);
}

processHipparcosData().catch(console.error);
