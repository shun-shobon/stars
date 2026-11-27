export class CatalogLoadError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "CatalogLoadError";
	}
}

export async function fetchCatalogFile(path: string, signal: AbortSignal): Promise<Response> {
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
export async function failOnNetworkError<T>(
	message: string,
	operation: () => Promise<T>,
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (!(error instanceof TypeError)) {
			throw error;
		}
		throw new CatalogLoadError(message, { cause: error });
	}
}
