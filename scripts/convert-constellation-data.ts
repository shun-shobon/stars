/**
 * Hipparcos Planetarium Data の星座線CSVを変換し、JSONを生成する
 *
 * 入力: hip_constellation_line.csv (星座略称, HIP1, HIP2) 出力:
 * src/data/constellation-lines.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

interface ConstellationLine {
	hip1: number;
	hip2: number;
}

interface OutputConstellation {
	abbr: string;
	lines: ConstellationLine[];
}

interface OutputData {
	constellations: OutputConstellation[];
	totalLines: number;
}

async function convertConstellationData(): Promise<void> {
	const inputPath = path.resolve(
		import.meta.dirname,
		"../data/hip_constellation_line.csv",
	);
	const outputPath = path.resolve(
		import.meta.dirname,
		"../src/data/constellation-lines.json",
	);

	// CSVが存在しない場合はエラー
	if (!fs.existsSync(inputPath)) {
		console.error(`ファイルが見つかりません: ${inputPath}`);
		process.exit(1);
	}

	// 星座ごとにグループ化
	const constellationMap = new Map<string, ConstellationLine[]>();

	const fileStream = fs.createReadStream(inputPath);
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity,
	});

	let totalLines = 0;

	for await (const line of rl) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const parts = trimmed.split(",");
		if (parts.length < 3) continue;

		const abbr = parts[0]?.trim();
		const hip1Str = parts[1]?.trim();
		const hip2Str = parts[2]?.trim();

		if (!abbr || !hip1Str || !hip2Str) continue;

		const hip1 = Number.parseInt(hip1Str, 10);
		const hip2 = Number.parseInt(hip2Str, 10);

		if (Number.isNaN(hip1) || Number.isNaN(hip2)) continue;

		if (!constellationMap.has(abbr)) {
			constellationMap.set(abbr, []);
		}
		constellationMap.get(abbr)!.push({ hip1, hip2 });
		totalLines++;
	}

	// 出力形式に変換
	const outputConstellations: OutputConstellation[] = [];

	for (const [abbr, lines] of constellationMap) {
		outputConstellations.push({ abbr, lines });
	}

	// 星座略称でソート
	outputConstellations.sort((a, b) => a.abbr.localeCompare(b.abbr));

	const outputData: OutputData = {
		constellations: outputConstellations,
		totalLines,
	};

	// 出力ディレクトリ作成
	const outputDir = path.dirname(outputPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// JSON出力
	fs.writeFileSync(outputPath, JSON.stringify(outputData, null, "\t"));

	console.log(`変換完了:`);
	console.log(`  星座数: ${outputConstellations.length.toString()}`);
	console.log(`  総線分数: ${totalLines.toString()}`);
	console.log(`  出力: ${outputPath}`);
}

convertConstellationData().catch(console.error);
