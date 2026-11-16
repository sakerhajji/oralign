'use client';

import { useT } from '@/lib/i18n/lang-context';
import { NoticeBox } from './notice-box';

/** Shown instead of a chart while no arch is chosen: teeth belong to a treated arch. */
export function ArchFirstNotice() {
  const { t } = useT();
  return <NoticeBox tone="warning">{t('supplemental.pickers.archFirst')}</NoticeBox>;
}
