import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in RayTab:', error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-slate-950 text-white select-none">
          <div className="max-w-md w-full p-6 rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-300 flex items-center justify-center mb-4">
              <AlertCircle size={24} />
            </div>
            <h2 className="text-lg font-semibold mb-2">遇到了一点小意外</h2>
            <p className="text-xs text-white/70 mb-4 leading-relaxed">
              页面暂时无法显示，您的数据已被安全保存。您可以尝试重新加载恢复。
            </p>
            {this.state.error?.message && (
              <pre className="w-full text-[11px] p-3 rounded-xl bg-black/40 text-rose-200/80 mb-4 overflow-x-auto text-left font-mono max-h-28">
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-slate-900 font-medium text-xs hover:bg-white/90 active:scale-95 transition-all shadow-md cursor-pointer"
            >
              <RefreshCw size={14} />
              重新加载
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
