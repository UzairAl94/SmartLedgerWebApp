import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Uncaught render error:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-[100dvh] w-full bg-bg-primary flex flex-col items-center justify-center p-8 gap-6 text-center max-w-[500px] mx-auto">
                    <div className="w-16 h-16 rounded-2xl bg-expense/10 text-expense flex items-center justify-center">
                        <AlertTriangle size={30} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
                        <p className="text-text-muted text-[14px]">
                            The app hit an unexpected error. Your data is safe on this device.
                        </p>
                        {this.state.error && (
                            <p className="text-text-muted text-[12px] mt-3 font-mono break-words opacity-70">
                                {this.state.error.message}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 bg-primary text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    >
                        Reload App
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
