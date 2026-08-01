import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        const msg = error?.message || "";
        const name = error?.name || "";
        if (
            msg.includes("Failed to fetch dynamically imported module") ||
            msg.includes("loading chunk") ||
            name === "ChunkLoadError"
        ) {
            console.warn("ErrorBoundary caught chunk loading error. Auto-reloading...");
            window.location.reload();
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                    <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                            <AlertTriangle size={32} />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
                        <p className="text-gray-500 text-sm">
                            {this.state.error?.message || "An unexpected error occurred."}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2 bg-primary text-secondary font-bold rounded-lg hover:bg-yellow-400 transition-colors flex items-center justify-center gap-2 mx-auto"
                        >
                            <RefreshCcw size={18} />
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
