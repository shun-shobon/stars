import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "~/ui/app";

const container = document.querySelector("#root");
if (container == null) {
	throw new Error("Root element #root is not found.");
}

createRoot(container).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
