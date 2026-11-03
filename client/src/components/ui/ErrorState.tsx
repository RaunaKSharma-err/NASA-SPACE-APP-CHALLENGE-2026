import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message: string;
  submessage?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({ message, submessage, onRetry, compact }: ErrorStateProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
        <AlertTriangle className="text-red-400 flex-shrink-0" size={14} />
        <span className="text-xs text-red-300 flex-1">{message}</span>
        {onRetry && (
          <button onClick={onRetry} className="text-red-400 hover:text-red-300 transition-colors">
            <RefreshCw size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 animate-fade-in">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
        <AlertTriangle className="text-red-400" size={24} />
      </div>
      <div className="text-center max-w-xs">
        <p className="text-sm text-slate-200">{message}</p>
        {submessage && <p className="text-xs text-slate-500 mt-1">{submessage}</p>}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-xs hover:bg-red-500/20 transition-colors"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  );
}
