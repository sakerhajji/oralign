import type { ReactNode } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONE = {
  info: {
    box: 'border-primary/20 bg-primary/5 text-foreground',
    icon: 'text-primary',
    body: 'text-muted-foreground',
    Icon: Info,
  },
  warning: {
    box: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200',
    icon: 'text-amber-600 dark:text-amber-300',
    body: '',
    Icon: TriangleAlert,
  },
} as const;

/** Callout for instructions and important information inside a step. */
export function NoticeBox({
  title,
  tone = 'info',
  children,
}: {
  title?: string;
  tone?: keyof typeof TONE;
  children: ReactNode;
}) {
  const { box, icon, body, Icon } = TONE[tone];
  return (
    <aside className={cn('flex gap-3 rounded-lg border p-4 text-sm leading-6', box)}>
      <Icon className={cn('mt-1 h-4 w-4 shrink-0', icon)} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn('[&_li]:mt-1', body)}>{children}</div>
      </div>
    </aside>
  );
}
