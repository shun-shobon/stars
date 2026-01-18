import { Provider } from "jotai";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "~/components/App";

import { store } from "./lib/store";

const container = document.querySelector("#root");
if (!container) {
	throw new Error("No root element found");
}

const root = createRoot(container);

root.render(
	<StrictMode>
		<Provider store={store}>
			<App />
		</Provider>
	</StrictMode>,
);
