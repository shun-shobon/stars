import type { FC } from "react";
import { Suspense } from "react";

import { ErrorBoundary } from "./ErrorBoundary";
import Starfield from "./Starfield";
import { SuspenseLoadingIndicator } from "./ui";

const App: FC = () => {
	return (
		<ErrorBoundary>
			<Suspense fallback={<SuspenseLoadingIndicator />}>
				<Starfield />
			</Suspense>
		</ErrorBoundary>
	);
};

export default App;
