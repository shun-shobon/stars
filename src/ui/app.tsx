import type { ReactNode } from "react";

import { findMissingBrowserFeatures } from "./browser-support";
import { ErrorPanel } from "./error-panel";
import { Observatory } from "./observatory";

export function App(): ReactNode {
	const missingFeatures = findMissingBrowserFeatures();
	if (missingFeatures.length > 0) {
		return (
			<ErrorPanel
				message={`このブラウザーは ${missingFeatures.join("・")} に対応していません。対応したブラウザーで開いてください。`}
			/>
		);
	}

	return <Observatory />;
}
