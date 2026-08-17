'use client';

import { useEffect, useState } from 'react';
import { Check, Edit3, Eye, Heart, Loader2, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  useApproveCommunitySubmission,
  useCommunitySubmissionsAdmin,
  useDeleteCommunitySubmission,
  usePermanentDeleteCommunitySubmission,
  useRejectCommunitySubmission,
  useRestoreCommunitySubmission,
} from '@/lib/hooks';
import { CommunitySubmissionFormat, CommunitySubmissionStatus, CommunitySubmissionTreatmentStatus, type CommunitySubmission } from '@/lib/types';
import { getAvatarUrl } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { PermanentDeleteDialog } from '@/components/shared/permanent-delete-dialog';
import { CommunitySubmissionEditor } from './community-submission-editor';

/**
 * The moderation queues plus the trash. `TRASH` is not a status — it maps
 * to `includeDeleted`, which the backend treats as "ONLY archived rows".
 */
const TRASH = 'trash' as const;
type Queue = CommunitySubmissionStatus | typeof TRASH;

export function AdminCommunityContent() {
  const { t } = useT();
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const [queue, setQueue] = useState<Queue>(CommunitySubmissionStatus.PENDING);
  const [selected, setSelected] = useState<CommunitySubmission | null>(null);
  const [editing, setEditing] = useState<CommunitySubmission | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [purgeTarget, setPurgeTarget] = useState<CommunitySubmission | null>(null);
  const inTrash = queue === TRASH;
  const list = useCommunitySubmissionsAdmin(
    inTrash ? { includeDeleted: true, page: 1, limit: 50 } : { status: queue, page: 1, limit: 50 },
    isAdmin,
  );
  const approve = useApproveCommunitySubmission();
  const reject = useRejectCommunitySubmission();
  const remove = useDeleteCommunitySubmission();
  const restore = useRestoreCommunitySubmission();
  const purge = usePermanentDeleteCommunitySubmission();

  useEffect(() => {
    if (user && !isAdmin) router.replace('/dashboard');
  }, [isAdmin, router, user]);

  const items = list.data?.data ?? [];

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 pb-8 sm:p-5 lg:p-8">
      <header className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Heart className="size-4" /></span> ORALIGN</div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('communityAdmin.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{t('communityAdmin.intro')}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => void list.refetch()} disabled={list.isFetching}>
            <RefreshCw className={list.isFetching ? 'mr-2 size-4 animate-spin' : 'mr-2 size-4'} />
            {t('communityAdmin.refresh')}
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus className="mr-2 size-4" />
            {t('communityAdmin.add')}
          </Button>
        </div>
      </header>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="gap-4 border-b bg-muted/20 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><CardTitle className="text-base">{t('communityAdmin.moderation')}</CardTitle><CardDescription>{items.length} témoignage(s)</CardDescription></div>
          <Tabs value={queue} onValueChange={(value) => setQueue(value as Queue)} className="w-full sm:w-auto">
            <TabsList className="grid h-10 w-full grid-cols-4 sm:w-fit">
              <TabsTrigger value={CommunitySubmissionStatus.PENDING}>{t('communityAdmin.pending')}</TabsTrigger>
              <TabsTrigger value={CommunitySubmissionStatus.APPROVED}>{t('communityAdmin.approved')}</TabsTrigger>
              <TabsTrigger value={CommunitySubmissionStatus.REJECTED}>{t('communityAdmin.rejected')}</TabsTrigger>
              <TabsTrigger value={TRASH}>{t('communityAdmin.trash')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-3 sm:p-5 lg:p-6">
          {list.isLoading ? <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('communityAdmin.loading')}</div> : null}
          {list.isError ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t('communityAdmin.error')}</div> : null}
          {!list.isLoading && !list.isError && items.length === 0 ? <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">{t('communityAdmin.empty')}</div> : null}
          <div className="grid gap-4">
            {items.map((item) => <SubmissionCard key={item.id} item={item} archived={inTrash} onPreview={() => setSelected(item)} onEdit={() => { setEditing(item); setEditorOpen(true); }} onApprove={() => approve.mutate(item.id)} onReject={() => { setSelected(item); setReviewNote(''); setRejectOpen(true); }} onDelete={() => remove.mutate(item.id)} onRestore={() => restore.mutate(item.id)} onPurge={() => setPurgeTarget(item)} busy={approve.isPending || reject.isPending || remove.isPending || restore.isPending} />)}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected) && !rejectOpen} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{selected ? `${selected.firstName} ${selected.lastNameInitial}` : ''}</DialogTitle><DialogDescription>{selected?.email} · {selected?.phone}</DialogDescription></DialogHeader>
          {selected ? <SubmissionDetail item={selected} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('communityAdmin.rejectTitle')}</DialogTitle><DialogDescription>{t('communityAdmin.rejectBody')}</DialogDescription></DialogHeader>
          <Textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder={t('communityAdmin.rejectPlaceholder')} maxLength={1000} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>{t('communityAdmin.cancel')}</Button>
            <Button variant="destructive" disabled={!selected || reject.isPending} onClick={() => { if (!selected) return; reject.mutate({ id: selected.id, reviewNote }, { onSuccess: () => { setRejectOpen(false); setSelected(null); } }); }}>{reject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}{t('communityAdmin.confirmReject')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Irreversible: erases the story AND its photos/videos from disk. */}
      <PermanentDeleteDialog
        open={Boolean(purgeTarget)}
        onOpenChange={(open) => { if (!open) setPurgeTarget(null); }}
        title={t('communityAdmin.permanentDeleteTitle')}
        description={
          purgeTarget
            ? `${purgeTarget.firstName} ${purgeTarget.lastNameInitial} — ${t('communityAdmin.permanentDeleteBody')}`
            : t('communityAdmin.permanentDeleteBody')
        }
        confirmLabel={t('communityAdmin.permanentDelete')}
        pending={purge.isPending}
        onConfirm={() => {
          if (!purgeTarget) return;
          purge.mutate(purgeTarget.id, { onSuccess: () => setPurgeTarget(null) });
        }}
      />

      <CommunitySubmissionEditor key={`${editorOpen ? 'open' : 'closed'}-${editing?.id ?? 'new'}`} open={editorOpen} existing={editing} onOpenChange={(open) => { setEditorOpen(open); if (!open) setEditing(null); }} />
    </div>
  );
}

function SubmissionCard({ item, archived, onPreview, onEdit, onApprove, onReject, onDelete, onRestore, onPurge, busy }: { item: CommunitySubmission; archived: boolean; onPreview: () => void; onEdit: () => void; onApprove: () => void; onReject: () => void; onDelete: () => void; onRestore: () => void; onPurge: () => void; busy: boolean }) {
  const { t } = useT();
  const media = item.media[0];
  const url = media ? getAvatarUrl(media.relativePath) : null;
  const format = item.format === CommunitySubmissionFormat.VIDEO ? t('communityAdmin.typeVideo') : item.format === CommunitySubmissionFormat.PHOTO ? t('communityAdmin.typePhoto') : t('communityAdmin.typeText');
  const treatment = item.treatmentStatus === CommunitySubmissionTreatmentStatus.COMPLETED ? t('communityAdmin.treatmentCompleted') : t('communityAdmin.treatmentInProgress');
  const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—';
  const archivedDate = item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : null;
  return (
    <article className="grid min-w-0 gap-4 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/30 sm:grid-cols-[176px_minmax(0,1fr)_auto] sm:p-4">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted sm:aspect-square">
        {url && media?.mimeType.startsWith('video/') ? <video src={url} controls preload="metadata" className="h-full w-full object-cover" /> : url ? <img src={url} alt={`${item.firstName} — ORALIGN`} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center p-3 text-center text-sm text-muted-foreground">{t('communityAdmin.noMedia')}</div>}
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{item.firstName} {item.lastNameInitial}</h2><Badge variant="secondary">{format}</Badge><Badge variant="outline">{treatment}</Badge></div>
        <p className="text-xs text-muted-foreground">{item.city || '—'} · {t('communityAdmin.submittedOn', { date })}{archivedDate ? ` · ${t('communityAdmin.archivedOn', { date: archivedDate })}` : ''}</p>
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{item.message || item.journey}</p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{item.email}</span><span>{item.phone}</span></div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch sm:justify-center">
        <Button variant="outline" size="sm" onClick={onPreview}><Eye className="mr-2 h-4 w-4" />{t('communityAdmin.experience')}</Button>
        {/* Archived rows are read-only: restore first, or purge for good.
            Permanent delete is offered ONLY from the trash — the backend
            refuses it on a live row anyway (400 NOT_ARCHIVED). */}
        {archived ? (
          <>
            <Button variant="outline" size="sm" onClick={onRestore} disabled={busy}><RotateCcw className="mr-2 h-4 w-4" />{t('communityAdmin.restore')}</Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onPurge}><Trash2 className="mr-2 h-4 w-4" />{t('communityAdmin.permanentDelete')}</Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onEdit}><Edit3 className="mr-2 h-4 w-4" />{t('communityAdmin.edit')}</Button>
            {item.status === CommunitySubmissionStatus.PENDING ? <><Button size="sm" onClick={onApprove} disabled={busy}><Check className="mr-2 h-4 w-4" />{t('communityAdmin.approve')}</Button><Button variant="outline" size="sm" onClick={onReject} disabled={busy}><X className="mr-2 h-4 w-4" />{t('communityAdmin.reject')}</Button></> : null}
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete} disabled={busy}><Trash2 className="mr-2 h-4 w-4" />{t('communityAdmin.delete')}</Button>
          </>
        )}
      </div>
    </article>
  );
}

function SubmissionDetail({ item }: { item: CommunitySubmission }) {
  const { t } = useT();
  return <div className="space-y-5 text-sm"><div className="grid gap-4 sm:grid-cols-2"><Detail label={t('communityAdmin.why')} value={item.why} /><Detail label={t('communityAdmin.journey')} value={item.journey} /><Detail label={t('communityAdmin.experience')} value={item.satisfied || '—'} /><Detail label="Message" value={item.message || '—'} /></div>{item.media.length ? <div><p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('communityAdmin.media')}</p><div className="grid gap-3 sm:grid-cols-2">{item.media.map((media) => { const url = getAvatarUrl(media.relativePath); return media.mimeType.startsWith('video/') ? <video key={media.id} src={url} controls className="max-h-80 w-full rounded-lg bg-black" /> : <img key={media.id} src={url} alt="Community submission" className="max-h-80 w-full rounded-lg object-contain bg-muted" />; })}</div></div> : null}</div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 whitespace-pre-wrap leading-6">{value}</p></div>; }
