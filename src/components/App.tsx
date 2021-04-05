import { Button } from "@base-ui/react";
import type { FC } from "react";

const App: FC = () => {
	return (
		<div className="flex h-screen w-screen flex-col items-center justify-center gap-4">
			<h1 className="text-2xl font-bold">Hello, world!</h1>
			<Button className="rounded-md bg-blue-500 px-4 py-2 text-white">
				Click me
			</Button>
		</div>
	);
};

export default App;
