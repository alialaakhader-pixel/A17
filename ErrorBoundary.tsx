import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('B11 App Caught Runtime Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050907] text-white flex flex-col items-center justify-center p-6 text-center font-['Cairo',sans-serif]">
          <div className="w-full max-w-md bg-neutral-900 border-2 border-lime-400/50 rounded-3xl p-8 shadow-[0_0_50px_rgba(203,251,99,0.25)] flex flex-col items-center">
            <div className="w-16 h-16 rounded-3xl bg-lime-400/10 border border-lime-400/40 flex items-center justify-center text-lime-400 mb-4 shadow-[0_0_20px_rgba(203,251,99,0.3)]">
              <AlertTriangle className="w-8 h-8 text-yellow-400" />
            </div>

            <h2 className="text-xl font-black text-lime-400 mb-2">
              حدث خطأ بسيط في العرض
            </h2>

            <p className="text-xs text-gray-300 leading-relaxed mb-6">
              تم احتواء المشكلة بنجاح ومنع توقف الشاشة. اضغط على الزر أدناه لإعادة تشغيل اللعبة بأمان دون فقدان أي بيانات.
            </p>

            <button
              onClick={this.handleReset}
              className="w-full py-3 rounded-2xl bg-lime-400 hover:bg-lime-300 text-black font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition shadow-lg active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إعادة تشغيل اللعبة فوراً ⚡</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
