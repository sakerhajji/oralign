'use client';

/**
 * The analyses of a treatment plan: the CBCT analysis and the
 * cephalometric analysis, one PDF each.
 *
 * The planner (admin, designer) drops a PDF on a slot or picks it with the
 * button, replaces it the same way, or removes it. Everyone with access to
 * the plan reads it on the page (first page in the slot, every page in the
 * full view) and downloads it.
 *
 * Data: the review payload lists the documents; the bytes are fetched once
 * per version (`updatedAt`) and drawn with pdf.js (lib/pdf/pdf-document).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { format } from 'date-fns';
import {
  Download,
  DraftingCompass,
  FileText,
  FileUp,
  FileWarning,
  Loader2,
  Lock,
  Maximize2,
  RotateCw,
  ScanLine,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { saveBlobAs } from '@/lib/api/blob-download';
import { extractApiErrorMessage } from '@/lib/api/error';
import { treatmentPlansService } from '@/lib/api/treatment-plans.service';
import {
  TREATMENT_PLAN_DOCUMENT_MAX_BYTES,
  useDeleteTreatmentPlanDocument,
  useTreatmentPlanDocumentBlob,
  useUploadTreatmentPlanDocument,
} from '@/lib/hooks/use-treatment-plans';
import {
  isRenderCancelled,
  openPdf,
  pageAspect,
  pdfOpenError,
  renderPage,
  type PdfOpenError,
  type PDFDocumentProxy,
} from '@/lib/pdf/pdf-document';
import {
  TREATMENT_PLAN_DOCUMENT_KINDS,
  TreatmentPlanDocumentKind,
  type TreatmentPlanDocument,
  type TreatmentPlanReview,
} from '@/lib/types';
import { dateLocaleOf } from './treatment-plan-patient-link';

const KIND_ICON: Record<TreatmentPlanDocumentKind, LucideIcon> = {
  [TreatmentPlanDocumentKind.CBCT_ANALYSIS]: ScanLine,
  [TreatmentPlanDocumentKind.CEPHALOMETRIC_ANALYSIS]: DraftingCompass,
};

/** A4 portrait, until the real page says otherwise. */
const DEFAULT_PAGE_ASPECT = Math.SQRT2;

// ─── Section ────────────────────────────────────────────────────────────────

export function TreatmentPlanDocumentsSection({
  review,
  canEdit,
  treatmentPlanId,
}: {
  review: TreatmentPlanReview;
  canEdit: boolean;
  treatmentPlanId: string;
}) {
  const { t } = useT();
  const documents = review.documents ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          {t('treatmentReview.analyses.cardTitle')}
          <span className="text-xs font-normal text-muted-foreground">
            {t('treatmentReview.analyses.cardSubtitle')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            canEdit
              ? 'treatmentReview.analyses.descPlanner'
              : 'treatmentReview.analyses.descReader',
          )}
        </p>
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-4">
          {TREATMENT_PLAN_DOCUMENT_KINDS.map((kind) => (
            <DocumentSlot
              key={kind}
              kind={kind}
              planId={treatmentPlanId}
              document={documents.find((d) => d.kind === kind) ?? null}
              canEdit={canEdit}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── One slot ───────────────────────────────────────────────────────────────

type FileProblem = 'notPdf' | 'tooLarge' | 'empty';

/**
 * The server's rules, checked before sending: a `.pdf` name, a PDF type
 * (or none, as some systems send), a size within the limit, and the
 * `%PDF-` signature in the first kilobyte.
 */
async function checkPdfFile(file: File): Promise<FileProblem | null> {
  const type = file.type.toLowerCase();
  const typeOk =
    type === '' ||
    type === 'application/pdf' ||
    type === 'application/x-pdf' ||
    type === 'application/octet-stream';
  if (!/\.pdf$/i.test(file.name) || !typeOk) return 'notPdf';
  if (file.size === 0) return 'empty';
  if (file.size > TREATMENT_PLAN_DOCUMENT_MAX_BYTES) return 'tooLarge';
  try {
    const head = await file.slice(0, 1024).text();
    if (!head.includes('%PDF-')) return 'notPdf';
  } catch {
    // Unreadable here: the server judges.
  }
  return null;
}

function DocumentSlot({
  kind,
  planId,
  document,
  canEdit,
}: {
  kind: TreatmentPlanDocumentKind;
  planId: string;
  document: TreatmentPlanDocument | null;
  canEdit: boolean;
}) {
  const { t } = useT();
  const title = t(`treatmentReview.analyses.kinds.${kind}.title`);
  const Icon = KIND_ICON[kind];

  const upload = useUploadTreatmentPlanDocument();
  const remove = useDeleteTreatmentPlanDocument();
  const blob = useTreatmentPlanDocumentBlob(planId, document);
  const pdf = usePdfDocument(blob.data);

  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [fullView, setFullView] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const busy = upload.isPending || remove.isPending;

  const startUpload = async (file: File) => {
    const problem = await checkPdfFile(file);
    if (problem) {
      toast.error(t(`treatmentReview.analyses.errors.${problem}`));
      return;
    }
    setProgress(0);
    upload.mutate(
      { id: planId, kind, file, onProgress: setProgress },
      { onSettled: () => setProgress(null) },
    );
  };

  const acceptFiles = (files: File[]) => {
    if (busy) {
      toast.error(t('treatmentReview.analyses.errors.busy'));
      return;
    }
    if (files.length !== 1) {
      toast.error(t('treatmentReview.analyses.errors.oneFile'));
      return;
    }
    void startUpload(files[0]);
  };

  const drop = useFileDrop(canEdit, acceptFiles);
  const openPicker = () => inputRef.current?.click();

  const download = async () => {
    if (!document) return;
    setDownloading(true);
    try {
      const bytes =
        blob.data ??
        (await treatmentPlansService.fetchDocumentBlob(planId, kind));
      saveBlobAs(bytes, document.fileName);
    } catch (error) {
      toast.error(
        extractApiErrorMessage(error) ||
          t('treatmentReview.analyses.errors.downloadFailed'),
      );
    } finally {
      setDownloading(false);
    }
  };

  const uploading = progress !== null;

  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h3 className="truncate text-sm font-semibold">{title}</h3>
      </div>

      {document ? (
        <div
          {...drop.handlers}
          className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
        >
          <DocumentPreview
            title={title}
            blobState={blob}
            pdf={pdf}
            onOpen={() => setFullView(true)}
          />

          {/* Facts above the actions: side by side, a half-width slot
              wraps its last button onto a line of its own. */}
          <div className="flex flex-col gap-2.5 border-t bg-muted/30 px-3 py-2.5">
            <div className="min-w-0 text-xs">
              <p className="truncate font-medium text-foreground" title={document.fileName}>
                {document.fileName}
              </p>
              <p className="text-muted-foreground">
                <DocumentFacts document={document} pageCount={pdf.doc?.numPages ?? null} />
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5 pointer-coarse:h-11 pointer-coarse:px-3.5"
                disabled={!pdf.doc}
                onClick={() => setFullView(true)}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                {t('treatmentReview.analyses.open')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 pointer-coarse:h-11 pointer-coarse:px-3.5"
                disabled={downloading}
                onClick={() => void download()}
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {t('treatmentReview.analyses.download')}
              </Button>
              {canEdit && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 pointer-coarse:h-11 pointer-coarse:px-3.5"
                    disabled={busy}
                    onClick={openPicker}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {t('treatmentReview.analyses.replace')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive pointer-coarse:h-11 pointer-coarse:px-3.5"
                    disabled={busy}
                    onClick={() => setConfirmRemove(true)}
                  >
                    {remove.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    {t('treatmentReview.analyses.remove')}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Replacing: what is happening covers the old document. */}
          {(uploading || drop.over) && (
            <div
              className={cn(
                'absolute inset-0 z-10 grid place-items-center rounded-2xl p-4',
                drop.over && !uploading
                  ? 'border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[2px]'
                  : 'bg-background/85 backdrop-blur-sm',
              )}
            >
              {uploading ? (
                <UploadProgress percent={progress ?? 0} />
              ) : (
                <p className="flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-medium text-primary shadow-sm ring-1 ring-primary/30">
                  <FileUp className="h-4 w-4" />
                  {t('treatmentReview.analyses.dropToReplace')}
                </p>
              )}
            </div>
          )}
        </div>
      ) : canEdit ? (
        uploading ? (
          <div
            {...drop.handlers}
            className="flex min-h-56 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-6"
          >
            <UploadProgress percent={progress ?? 0} />
          </div>
        ) : (
          // The whole zone is one button: Enter / Space opens the picker,
          // a click does too, and a PDF dropped on it is uploaded.
          <button
            type="button"
            {...drop.handlers}
            onClick={openPicker}
            aria-label={t('treatmentReview.analyses.dropzoneAria', { title })}
            className={cn(
              'flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-muted/20 p-6 text-center outline-none transition',
              'hover:border-primary/50 hover:bg-primary/5 focus-visible:border-primary focus-visible:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/40',
              drop.over && 'border-primary bg-primary/10',
            )}
          >
            <span
              className={cn(
                'grid size-12 place-items-center rounded-full bg-background text-muted-foreground ring-1 ring-foreground/10 transition',
                drop.over && 'text-primary ring-primary/40',
              )}
            >
              <FileUp className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-medium">
                {drop.over
                  ? t('treatmentReview.analyses.dropToUpload')
                  : t('treatmentReview.analyses.empty')}
              </span>
              <span className="block text-xs text-muted-foreground pointer-coarse:hidden">
                {t('treatmentReview.analyses.dropHint')}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                buttonVariants({ variant: 'secondary' }),
                'pointer-events-none gap-2 pointer-coarse:h-11 pointer-coarse:px-4',
              )}
            >
              <Upload className="h-4 w-4" />
              {t('treatmentReview.analyses.choose')}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {t('treatmentReview.analyses.limits')}
            </span>
          </button>
        )
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border bg-muted/10 p-6 text-center text-sm text-muted-foreground">
          <Icon className="h-6 w-6 opacity-60" aria-hidden="true" />
          {t('treatmentReview.analyses.readonlyEmpty')}
        </div>
      )}

      {canEdit && (
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) acceptFiles([file]);
          }}
        />
      )}

      {document && pdf.doc && (
        <DocumentFullView
          open={fullView}
          onOpenChange={setFullView}
          title={title}
          document={document}
          doc={pdf.doc}
          downloading={downloading}
          onDownload={() => void download()}
        />
      )}

      {canEdit && document && (
        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t(`treatmentReview.analyses.kinds.${kind}.removeTitle`)}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('treatmentReview.analyses.removeDesc', {
                  name: document.fileName,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => remove.mutate({ id: planId, kind })}
              >
                {t('treatmentReview.analyses.remove')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}

function UploadProgress({ percent }: { percent: number }) {
  const { t } = useT();
  const sent = percent >= 100;
  return (
    <div className="w-full max-w-xs space-y-2 text-center" aria-live="polite">
      <p className="flex items-center justify-center gap-2 text-sm font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {sent
          ? t('treatmentReview.analyses.checking')
          : t('treatmentReview.analyses.uploading', { percent })}
      </p>
      <Progress value={percent} aria-label={t('treatmentReview.analyses.progressAria')} />
    </div>
  );
}

/** "3 pages · 2,4 Mo · Ajouté le 26 nov. 2026 par Sarra". */
function DocumentFacts({
  document,
  pageCount,
}: {
  document: TreatmentPlanDocument;
  pageCount: number | null;
}) {
  const { t, lang } = useT();
  const added = format(new Date(document.updatedAt), 'PP', {
    locale: dateLocaleOf(lang),
  });
  const facts = [
    pageCount === null
      ? null
      : t(
          pageCount === 1
            ? 'treatmentReview.analyses.pagesOne'
            : 'treatmentReview.analyses.pagesMany',
          { count: pageCount },
        ),
    formatBytes(document.sizeBytes, lang),
    document.uploadedByName
      ? t('treatmentReview.analyses.addedOnBy', {
          date: added,
          name: document.uploadedByName,
        })
      : t('treatmentReview.analyses.addedOn', { date: added }),
  ].filter(Boolean);
  return <>{facts.join(' · ')}</>;
}

function formatBytes(bytes: number, lang: string): string {
  const fr = lang === 'fr';
  const number = new Intl.NumberFormat(fr ? 'fr-FR' : 'en-GB', {
    maximumFractionDigits: 1,
  });
  if (bytes < 1024 * 1024) {
    return `${number.format(Math.max(1, Math.round(bytes / 1024)))} ${fr ? 'Ko' : 'KB'}`;
  }
  return `${number.format(bytes / (1024 * 1024))} ${fr ? 'Mo' : 'MB'}`;
}

// ─── Preview (first page) ───────────────────────────────────────────────────

function DocumentPreview({
  title,
  blobState,
  pdf,
  onOpen,
}: {
  title: string;
  blobState: ReturnType<typeof useTreatmentPlanDocumentBlob>;
  pdf: PdfState;
  onOpen: () => void;
}) {
  const { t } = useT();

  if (blobState.isError) {
    return (
      <PreviewMessage icon={FileWarning}>
        <span>{t('treatmentReview.analyses.loadFailed')}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 pointer-coarse:h-11"
          onClick={() => void blobState.refetch()}
        >
          <RotateCw className="h-3.5 w-3.5" />
          {t('treatmentReview.analyses.retry')}
        </Button>
      </PreviewMessage>
    );
  }
  if (pdf.error) {
    return (
      <PreviewMessage icon={pdf.error === 'password' ? Lock : FileWarning}>
        {t(
          pdf.error === 'password'
            ? 'treatmentReview.analyses.previewProtected'
            : 'treatmentReview.analyses.previewFailed',
        )}
      </PreviewMessage>
    );
  }
  if (!pdf.doc) {
    return (
      <div className="flex h-72 items-center justify-center gap-2 bg-muted/30 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('treatmentReview.analyses.loadingPreview')}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('treatmentReview.analyses.openAria', { title })}
      className="group relative block w-full overflow-hidden bg-muted/40 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 sm:p-4"
    >
      {/* The top of page 1: where a report puts the patient and the
          headline results. The rest is one tap away. */}
      <div className="max-h-[26rem] overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-foreground/10">
        <PdfPage doc={pdf.doc} pageNumber={1} />
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-muted/90 to-transparent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm ring-1 ring-foreground/10 transition group-hover:bg-background group-focus-visible:bg-background"
      >
        <Maximize2 className="h-3 w-3" />
        {t('treatmentReview.analyses.openFull')}
      </span>
    </button>
  );
}

function PreviewMessage({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
      <Icon className="h-6 w-6" aria-hidden="true" />
      {children}
    </div>
  );
}

// ─── Full view (every page, drawn when near the screen) ─────────────────────

function DocumentFullView({
  open,
  onOpenChange,
  title,
  document,
  doc,
  downloading,
  onDownload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  document: TreatmentPlanDocument;
  doc: PDFDocumentProxy;
  downloading: boolean;
  onDownload: () => void;
}) {
  const { t } = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [firstAspect, setFirstAspect] = useState(DEFAULT_PAGE_ASPECT);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    doc
      .getPage(1)
      .then((page) => {
        if (active) setFirstAspect(pageAspect(page));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [doc, open]);

  const pageNumbers = Array.from({ length: doc.numPages }, (_, i) => i + 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92svh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b px-4 py-3 pr-14 text-left pointer-coarse:pr-16">
          <div className="min-w-0 space-y-1">
            <DialogTitle className="truncate">{title}</DialogTitle>
            <DialogDescription className="truncate text-xs">
              {document.fileName} ·{' '}
              {t(
                doc.numPages === 1
                  ? 'treatmentReview.analyses.pagesOne'
                  : 'treatmentReview.analyses.pagesMany',
                { count: doc.numPages },
              )}
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 pointer-coarse:h-11"
            disabled={downloading}
            onClick={onDownload}
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span className="max-sm:sr-only">
              {t('treatmentReview.analyses.download')}
            </span>
          </Button>
        </DialogHeader>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/50 px-2 py-4 sm:px-6"
        >
          <ol className="mx-auto flex max-w-4xl flex-col gap-4">
            {pageNumbers.map((pageNumber) => (
              <li key={pageNumber} className="space-y-1.5">
                <LazyPdfPage
                  doc={doc}
                  pageNumber={pageNumber}
                  fallbackAspect={firstAspect}
                  rootRef={scrollRef}
                />
                <p className="text-center text-[11px] text-muted-foreground tabular-nums">
                  {t('treatmentReview.analyses.pageOf', {
                    page: pageNumber,
                    count: doc.numPages,
                  })}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A page that is drawn only while it is within two screens of the visible
 * area, and dropped again further away: a 60-page report never holds 60
 * full-size canvases.
 */
function LazyPdfPage({
  doc,
  pageNumber,
  fallbackAspect,
  rootRef,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  fallbackAspect: number;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(pageNumber <= 2);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { root: rootRef.current, rootMargin: '200% 0px' },
    );
    observer.observe(slot);
    return () => observer.disconnect();
  }, [rootRef]);

  return (
    <div
      ref={slotRef}
      className="overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-foreground/10"
    >
      {near ? (
        <PdfPage doc={doc} pageNumber={pageNumber} fallbackAspect={fallbackAspect} />
      ) : (
        <div style={{ aspectRatio: `1 / ${fallbackAspect}` }} />
      )}
    </div>
  );
}

/**
 * One page at the width of its box. Redrawn (debounced) when the box
 * changes width; the previous drawing stays up until the new one is ready.
 */
function PdfPage({
  doc,
  pageNumber,
  fallbackAspect = DEFAULT_PAGE_ASPECT,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  fallbackAspect?: number;
}) {
  const { t } = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(hostRef);
  const [aspect, setAspect] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || width === 0) return undefined;
    let cancelled = false;
    let cancelRender: (() => void) | null = null;

    doc
      .getPage(pageNumber)
      .then(async (page) => {
        if (cancelled) return;
        setAspect(pageAspect(page));
        const render = renderPage(page, width);
        cancelRender = () => render.task.cancel();
        await render.task.promise;
        if (cancelled) return;
        render.canvas.setAttribute('aria-hidden', 'true');
        host.replaceChildren(render.canvas);
      })
      .catch((error: unknown) => {
        if (!cancelled && !isRenderCancelled(error)) setFailed(true);
      });

    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [doc, pageNumber, width]);

  return (
    <div
      role="img"
      aria-label={t('treatmentReview.analyses.pageAria', { page: pageNumber })}
      className="relative w-full bg-white"
      style={{ aspectRatio: `1 / ${aspect ?? fallbackAspect}` }}
    >
      <div ref={hostRef} className="absolute inset-0" />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
          <FileWarning className="h-4 w-4" aria-hidden="true" />
          {t('treatmentReview.analyses.pageFailed')}
        </div>
      )}
    </div>
  );
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

interface PdfState {
  doc: PDFDocumentProxy | null;
  error: PdfOpenError | null;
}

/**
 * The pdf.js document of `blob`, opened once and destroyed when the blob
 * changes or the slot unmounts. State is only set from the async result,
 * keyed by the blob it belongs to, so a stale document is never shown.
 */
function usePdfDocument(blob: Blob | undefined): PdfState {
  const [state, setState] = useState<{
    blob: Blob | null;
    doc: PDFDocumentProxy | null;
    error: PdfOpenError | null;
  }>({ blob: null, doc: null, error: null });

  useEffect(() => {
    if (!blob) return undefined;
    let cancelled = false;
    let destroy: (() => void) | null = null;

    openPdf(blob)
      .then((task) => {
        destroy = () => void task.destroy();
        if (cancelled) {
          destroy();
          return null;
        }
        return task.promise;
      })
      .then((doc) => {
        if (doc && !cancelled) setState({ blob, doc, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ blob, doc: null, error: pdfOpenError(error) });
      });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [blob]);

  if (!blob || state.blob !== blob) return { doc: null, error: null };
  return { doc: state.doc, error: state.error };
}

/** The element's content width in whole CSS pixels, settled for 120 ms. */
function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    let timer: number | undefined;
    let first = true;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry.contentRect.width);
      if (next <= 0) return;
      window.clearTimeout(timer);
      if (first) {
        first = false;
        setWidth(next);
        return;
      }
      timer = window.setTimeout(() => setWidth(next), 120);
    });
    observer.observe(element);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [ref]);

  return width;
}

/**
 * Files dragged over an element: `over` while they hover it (a depth
 * counter, so moving across child elements does not flicker), `onFiles`
 * on drop. When enabled it always takes the drop, so a PDF released on the
 * slot never makes the browser leave the page to open it.
 */
function useFileDrop(enabled: boolean, onFiles: (files: File[]) => void) {
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  });

  const carriesFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files');

  const onDragEnter = useCallback((event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setOver(true);
  }, []);
  const onDragOver = useCallback((event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);
  const onDragLeave = useCallback((event: DragEvent) => {
    if (!carriesFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  }, []);
  const onDrop = useCallback((event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    onFilesRef.current(Array.from(event.dataTransfer.files));
  }, []);

  return {
    over: enabled && over,
    handlers: enabled ? { onDragEnter, onDragOver, onDragLeave, onDrop } : {},
  };
}
