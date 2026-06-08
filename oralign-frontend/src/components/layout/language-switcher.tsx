'use client';

import { Check, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/lib/i18n/lang-context';
import { LANGS, type Lang } from '@/lib/i18n/dict';
import { cn } from '@/lib/utils';

/**
 * Header-mounted language toggle.
 *
 * One trigger button (Globe icon + 2-letter language code) opens a
 * dropdown that lists the supported locales with their endonyms (the
 * way each language refers to itself) — that's the friendliest UI for
 * a multilingual user who may not read the language they currently
 * have selected.
 *
 * Persistence lives in `useLang` (localStorage + custom event). This
 * component is purely presentation.
 */
const LABELS: Record<Lang, { code: string; endonym: string; flag: string }> = {
  en: { code: 'EN', endonym: 'English', flag: '🇬🇧' },
  fr: { code: 'FR', endonym: 'Français', flag: '🇫🇷' },
};

export function LanguageSwitcher({
  className,
  variant = 'ghost',
}: {
  className?: string;
  /** Tailwind variant of the trigger Button — `ghost` matches the header. */
  variant?: 'ghost' | 'outline';
}) {
  const { lang, setLang, t } = useT();
  const current = LABELS[lang];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="sm"
          className={cn(
            'h-8 gap-1.5 px-2.5 text-xs font-medium tracking-wide',
            className,
          )}
          aria-label={t('language.label')}
        >
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{current.code}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('language.label')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGS.map((l) => {
          const meta = LABELS[l];
          const isActive = l === lang;
          return (
            <DropdownMenuItem
              key={l}
              onSelect={() => setLang(l)}
              className={cn(
                'cursor-pointer gap-2',
                // Don't let RTL leak into the dropdown row layout —
                // the menu reads "flag · endonym · check" in every
                // language, never mirrored.
                'flex-row',
              )}
            >
              <span aria-hidden="true" className="text-base leading-none">
                {meta.flag}
              </span>
              <span className="flex-1 text-sm">{meta.endonym}</span>
              {isActive ? (
                <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
