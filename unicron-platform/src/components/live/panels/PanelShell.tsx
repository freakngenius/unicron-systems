import { useEffect, type ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  header?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

export function PanelShell({ open, title, subtitle, header, footer, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={[
          'fixed inset-0 z-30 bg-black/40 transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        aria-hidden
      />
      <aside
        className={[
          'fixed right-0 top-14 bottom-0 w-[480px] z-40 bg-bg-panel border-l border-border-default flex flex-col',
          'transition-transform duration-[250ms] ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        role="dialog"
        aria-label={title}
      >
        {header ? (
          <div className="border-b border-border-default px-6 pt-5 pb-4 relative">
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-5 text-text-primary/60 hover:text-text-primary mono text-base leading-none w-6 h-6 flex items-center justify-center"
            >
              ×
            </button>
            {header}
          </div>
        ) : (
          <div className="h-16 flex items-center justify-between px-6 border-b border-border-default flex-shrink-0">
            <div>
              <div className="text-[18px] leading-tight text-text-primary">{title}</div>
              {subtitle && (
                <div className="text-[13px] text-text-secondary mt-0.5">{subtitle}</div>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-text-primary/60 hover:text-text-primary mono text-base leading-none w-6 h-6 flex items-center justify-center"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {footer && (
          <div className="border-t border-border-default px-6 py-4 bg-bg-panel">{footer}</div>
        )}
      </aside>
    </>
  );
}
