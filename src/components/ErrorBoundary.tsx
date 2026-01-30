/**
 * エラーバウンダリコンポーネント
 */

import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

import { ErrorPanel } from "./ui";

interface ErrorBoundaryProps {
	children: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

/**
 * エラーをキャッチして表示するErrorBoundary
 */
export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error("ErrorBoundary caught an error:", error, errorInfo);
	}

	override render(): ReactNode {
		if (this.state.hasError && this.state.error) {
			return <ErrorPanel message={this.state.error.message} />;
		}

		return this.props.children;
	}
}
