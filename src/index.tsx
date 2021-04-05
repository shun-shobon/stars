import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "~/components/App";

const container = document.querySelector("#root");
if (!container) {
	throw new Error("No root element found");
}

const root = createRoot(container);

root.render(
	<StrictMode>
		<App />
	</StrictMode>,
);
