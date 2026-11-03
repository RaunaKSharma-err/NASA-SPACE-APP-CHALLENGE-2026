import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  badge?: string | number;
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({ title, defaultOpen = false, badge, children, className = '' }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`border-b border-[#344252]/30 ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
      >
        {open ? (
          <ChevronDown className="text-[#8D9CAF] flex-shrink-0" size={12} aria-hidden />
        ) : (
          <ChevronRight className="text-[#8D9CAF] flex-shrink-0" size={12} aria-hidden />
        )}
        <span className="section-title flex-1">{title}</span>
        {badge !== undefined && (
          <span className="text-[10px] text-[#8D9CAF] font-mono">{badge}</span>
        )}
      </button>
      {open && (
        <div className="px-2 pb-2 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}