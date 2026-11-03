import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  submessage?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingState({ message = 'Loading', submessage, size = 'md' }: LoadingStateProps) {
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 32 : 24;
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 animate-fade-in">
      <Loader2 className="text-accent-400 animate-spin" size={iconSize} />
      <div className="text-center">
        <p className="text-sm text-slate-300">{message}</p>
        {submessage && <p className="text-xs text-slate-500 mt-1">{submessage}</p>}
      </div>
    </div>
  );
}
