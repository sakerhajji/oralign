import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OrderFileCategory, ToothInstructionType, TreatmentPlanStatus, type TreatmentPlan, type TreatmentPlanIpr } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { Browser } from 'puppeteer-core';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderResponseDto } from '../dto/order.dto';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

// Same palette as the frontend odontogram (COLORS in
// odontogram-selector.tsx) so the printed chart reads identically to
// the on-screen one.
type MarkStyle = {
  hex: string;
  outline: string;
  short: string;
  labelFr: string;
  labelEn: string;
};
const MARK_STYLES: Record<ToothInstructionType, MarkStyle> = {
  [ToothInstructionType.no_attachments]: {
    hex: '#2563eb',
    outline: '#3b82f6',
    short: 'NA',
    labelFr: 'Pas de taquets',
    labelEn: 'No attachments',
  },
  [ToothInstructionType.do_not_move]: {
    hex: '#ef4444',
    outline: '#f87171',
    short: 'DNM',
    labelFr: 'Ne pas déplacer',
    labelEn: 'Do not move',
  },
  [ToothInstructionType.no_ipr]: {
    hex: '#22c55e',
    outline: '#4ade80',
    short: 'NoIPR',
    labelFr: 'Pas d’IPR',
    labelEn: 'No IPR',
  },
  [ToothInstructionType.extract]: {
    hex: '#f97316',
    outline: '#fb923c',
    short: 'EXT',
    labelFr: 'Extraction',
    labelEn: 'Extract',
  },
  [ToothInstructionType.attachment]: {
    hex: '#ec4899',
    outline: '#f472b6',
    short: 'ATT',
    labelFr: 'Taquet',
    labelEn: 'Attachment',
  },
  [ToothInstructionType.ipr_value]: {
    hex: '#eab308',
    outline: '#facc15',
    short: 'IPR',
    labelFr: 'IPR (mm)',
    labelEn: 'IPR (mm)',
  },
};

// Photo categories embedded as IMAGES in the sheet (everything else —
// STL/PLY/OBJ scans, CBCT bundles, PDFs — stays in the files table: a
// mesh has no meaningful thumbnail). Labels carry the same RIGHT/LEFT
// SWAP as the lab ZIP folders: intraoral side photos are mirrored, so
// the file stored as right_photo shows the patient's LEFT side.
const PHOTO_CATEGORIES: OrderFileCategory[] = [
  OrderFileCategory.right_photo,
  OrderFileCategory.left_photo,
  OrderFileCategory.front_photo,
  OrderFileCategory.upper_photo,
  OrderFileCategory.lower_photo,
  OrderFileCategory.orthopantomography,
  OrderFileCategory.image,
];

const PHOTO_LABELS: Record<string, string> = {
  right_photo: 'Photo dents gauche · Left teeth photo',
  left_photo: 'Photo dents droite · Right teeth photo',
  front_photo: 'Photo de face · Front photo',
  upper_photo: 'Arcade supérieure · Upper arch',
  lower_photo: 'Arcade inférieure · Lower arch',
  orthopantomography: 'Radio panoramique · Panoramic X-ray',
  image: 'Image',
};

/** A photo row as re-read from the DB for embedding (variants included). */
interface SheetPhotoFile {
  category: string;
  relativePath: string;
  mimeType: string;
  originalName: string | null;
  variants: unknown;
}

// FDI display order — patient's right on the reader's left, the
// convention every dental chart (and the clinic's reference sheet) uses.
const UPPER_ROW = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_ROW = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const DEFAULT_TOOTH = '#f1e8d4';
const DEFAULT_OUTLINE = '#f3eeea';

// ── Stored-value → French display label maps ────────────────────────
// Order fields store stable ENGLISH values (same rule as the wizard);
// only the printed label is localized. Unknown values fall through and
// print as stored, so legacy free-text rows still render.
const VALUE_FR: Record<string, string> = {
  // open bite / crossbite / midline
  Correct: 'Corriger',
  Maintain: 'Maintenir',
  Improved: 'Amélioration',
  'Correct only anterior': 'Corriger seulement les antérieurs',
  'Correct only posterior': 'Corriger seulement les postérieurs',
  // IPR / expansion choices
  No: 'Non',
  Anterior: 'Antérieurs',
  Posterior: 'Postérieurs',
  Both: 'Les deux',
  Priority: 'En priorité',
  'If necessary': 'Si nécessaire',
  'No IPR': 'Pas d’IPR',
  'No expansion': 'Pas d’expansion',
  // spaces
  'Close all spaces': 'Fermer tous les espaces',
  'Maintain spaces': 'Maintenir les espaces',
  // elastics
  'No elastics': 'Pas d’élastiques',
  'Class I elastics': 'Élastiques classe I',
  'Class II elastics': 'Élastiques classe II',
  'Class III elastics': 'Élastiques classe III',
  'Vertical bite elastics': 'Élastiques verticaux',
  'Criss-cross elastics': 'Élastiques en croix',
  // bite ramps (stored keys stay the stable English values)
  'Occlusal stop': 'Cale molaire occlusale',
  Incisors: 'Rétro-incisive maxillaire de 12 à 22',
  Molars: 'Rétro-incisive maxillaire 11, 21',
  Canines: 'Face palatine de la canine supérieure',
};

const CONDITION_FR: Record<string, string> = {
  Crowding: 'Encombrement',
  Spacing: 'Espacement',
  'Class II Division 1': 'Classe II Division 1',
  'Class II Division 2': 'Classe II Division 2',
  'Class III': 'Classe III',
  'Open bite': 'Béance',
  'Anterior crossbite': 'Articulé inversé antérieur',
  'Posterior crossbite': 'Articulé inversé postérieur',
  'Deep bite': 'Supraclusion',
  'Narrow arch': 'Arcade étroite',
  Proclination: 'Vestibulo-version',
  'Increased overjet': 'Surplomb augmenté',
  'Unesthetic smile': 'Sourire inesthétique',
  'Dental shape anomaly': 'Anomalie de forme dentaire',
  'TMJ problem (temporomandibular dislocation)':
    'Troubles de l’articulation temporo-mandibulaire (ATM)',
  Other: 'Autre',
};

const STATUS_FR: Record<string, string> = {
  draft: 'Brouillon',
  submitted: 'Soumise',
  under_review: 'En cours d’examen',
  treatment_planning: 'Planification du traitement',
  treatment_plan_ready: 'Plan de traitement prêt',
  revision_requested: 'Révision demandée',
  treatment_approved: 'Traitement approuvé',
  quotation_sent: 'Devis envoyé',
  payment_plan_selected: 'Plan de paiement choisi',
  payment_pending: 'Paiement en attente',
  payment_review: 'Paiement en vérification',
  paid: 'En fabrication',
  fabrication: 'En fabrication',
  ready_to_ship: 'Prêt à expédier',
  shipped: 'Expédiée',
  finished: 'Terminée',
  canceled: 'Annulée',
  in_review: 'En cours d’examen',
  approved: 'Approuvée',
  rejected: 'Rejetée',
  cancelled: 'Annulée',
};

const STAGE_FR: Record<string, string> = {
  initial: 'Initiale',
  refinement: 'Finition',
  retainer: 'Contention',
};

const ARCH_FR: Record<string, string> = {
  upper: 'Arcade supérieure',
  lower: 'Arcade inférieure',
  both: 'Les deux arcades',
};

const FILE_CATEGORY_FR: Record<string, string> = {
  right_photo: 'Photo droite',
  front_photo: 'Photo de face',
  left_photo: 'Photo gauche',
  upper_photo: 'Photo occlusale sup.',
  lower_photo: 'Photo occlusale inf.',
  pano_xray: 'Radio panoramique',
  ceph_xray: 'Téléradiographie',
  stl: 'Scan 3D (STL)',
  zip: 'CBCT / DICOM (ZIP)',
  dental_table: 'Tableau de traitement',
  other: 'DICOM',
};

/**
 * Branded "Fiche de commande" PDF renderer — the human-readable order
 * sheet embedded in the download-all ZIP (replacing the old raw
 * `order-data.json`). Mirrors `InvoicePdfService` in structure: same
 * Puppeteer launch pattern, same A4 print emulation, same masthead so
 * the sheet reads as a member of the same document family.
 *
 * The odontogram reuses the EXACT frontend artwork: the tooth sprite
 * (assets/teeth-sprite.svg, copied from the frontend's public/) is
 * inlined into the HTML and each tooth is a `<use>` painted through the
 * same `--tooth-color` / `--tooth-outline` CSS variables the app uses.
 */
@Injectable()
export class OrderPdfService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderPdfService.name);
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Warm the renderer at boot: launching Chromium costs ~1.5s, and
   * without this the first planner to export an order that day pays it
   * inside their request. Detached and failure-tolerant — a box without
   * Chromium must still boot (the export falls back to JSON), so this
   * only logs and lets `getBrowser()` retry on demand.
   */
  onModuleInit(): void {
    void this.getBrowser()
      .then(() => this.logger.log('✓ Order-sheet PDF renderer ready'))
      .catch((err: unknown) => {
        this.logger.warn(
          `PDF renderer warm-up skipped: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browserPromise) {
      try {
        const browser = await this.browserPromise;
        await browser.close();
      } catch {
        // shutdown best-effort
      }
      this.browserPromise = null;
    }
  }

  // ─── Public API ────────────────────────────────────────────────

  async renderOrderSheet(dto: OrderResponseDto): Promise<Buffer> {
    // Same active-settings row getActive() resolves — queried directly
    // so this module doesn't need to import the quotations module.
    const settings = await this.prisma.companyBillingSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    // The sheet is the lab's reference document, so it carries the plan
    // the doctor ACTUALLY approved — not a draft, not a rejected one.
    // Latest approval wins when several versions were approved over time.
    const approvedPlan = await this.prisma.treatmentPlan.findFirst({
      where: {
        orderId: dto.id,
        status: TreatmentPlanStatus.approved,
        deletedAt: null,
      },
      orderBy: [{ approvedAt: 'desc' }, { version: 'desc' }],
      include: {
        iprEntries: { orderBy: [{ fromTooth: 'asc' }] },
      },
    });
    // Photo files re-read from the DB rather than the DTO: the variant
    // PATHS are deliberately stripped from the API shape, and the sheet
    // wants the compressed md/thumb renditions, not multi-MB originals.
    const photoFiles = await this.prisma.orderFile.findMany({
      where: {
        orderId: dto.id,
        deletedAt: null,
        category: { in: PHOTO_CATEGORIES },
      },
      orderBy: [{ category: 'asc' }, { orderIndex: 'asc' }],
      select: {
        category: true,
        relativePath: true,
        mimeType: true,
        originalName: true,
        variants: true,
      },
    });
    const logo = this.resolveImageDataUrl(settings?.companyLogoPath ?? null);
    const brandName = (settings?.companyName ?? 'ORALIGN').trim() || 'ORALIGN';
    const html = this.renderHtml(dto, { logo, brandName }, approvedPlan, photoFiles);
    return this.renderHtmlToBuffer(html);
  }

  // ─── HTML template ─────────────────────────────────────────────

  private renderHtml(
    dto: OrderResponseDto,
    branding: { logo: string | null; brandName: string },
    approvedPlan:
      | (TreatmentPlan & { iprEntries: TreatmentPlanIpr[] })
      | null = null,
    photoFiles: SheetPhotoFile[] = [],
  ): string {
    const esc = this.escapeHtml.bind(this);
    const statusLabel = STATUS_FR[dto.status] ?? dto.status;

    const metaRows = [
      ['Commande', dto.orderCode],
      ['Créée le', this.fmtDate(dto.createdAt)],
      dto.submittedAt ? ['Soumise le', this.fmtDate(dto.submittedAt)] : null,
    ].filter(Boolean) as [string, string][];

    // ── Parties ──
    const patientBox = this.box(
      'Patient',
      this.kvRows([
        ['Nom', dto.patient?.fullName],
        ['Email', dto.patient?.email],
        ['Téléphone', dto.patient?.phone],
      ]),
    );
    const doctorBox = this.box(
      'Praticien',
      this.kvRows([
        ['Nom', dto.doctor?.fullName],
        ['Email', dto.doctor?.email],
      ]),
    );

    // ── Clinical + treatment fields ──
    const clinicalRows = this.kvRows([
      ['Motif de consultation', this.formatChiefComplaint(dto.chiefComplaint)],
      ['Stade', dto.patientStage ? (STAGE_FR[dto.patientStage] ?? dto.patientStage) : undefined],
      ['Arcades à traiter', dto.archTreatment ? (ARCH_FR[dto.archTreatment] ?? dto.archTreatment) : undefined],
      ['Plan de traitement', dto.treatmentPlan],
      ['Relation antéro-postérieure', dto.anteroposteriorRelationship ?? dto.apRelationship],
      ['Ne pas déplacer', dto.dontMoveOption],
    ]);

    const advancedRows = this.kvRows([
      ['Élastiques', this.formatElastics(dto.elastics)],
      ['Béance', this.frValue(dto.openBite)],
      ['Ligne médiane', this.frValue(dto.midline)],
      ['IPR', this.frValue(dto.ipr)],
      ['Plans de morsure', this.frValue(dto.biteRamps)],
      ['Expansion', this.frValue(dto.expansion)],
      ['Articulé inversé', this.frValue(dto.crossbite)],
      ['Espaces', this.frValue(dto.spaces)],
      ['Extractions', dto.extractions],
    ]);

    const instructionRows = this.kvRows([
      ['Instructions particulières', dto.specialInstructions],
      ['Instructions complémentaires', dto.additionalInstructions],
    ]);

    const cbctLine = dto.useCbctWithScans
      ? dto.cbctFeeAmount && dto.cbctFeeAmount > 0
        ? `Oui — supplément ${this.fmtAmount(dto.cbctFeeAmount)} ${esc(dto.cbctFeeCurrency ?? 'TND')}`
        : 'Oui'
      : 'Non';
    const manufacturingRows = this.kvRows([
      ['CBCT avec scans', cbctLine],
      ['Fabrication demandée', dto.wantsManufacturing ? 'Oui' : 'Non'],
      dto.materials?.length ? ['Matériaux', dto.materials.join(', ')] : ['', undefined],
    ]);

    const odontogram = this.renderOdontogram(dto);
    const filesTable = this.renderFilesTable(dto);

    return `<!doctype html>
<html lang="fr" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 11mm; }
      * { box-sizing: border-box; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body {
        margin: 0;
        color: #111111;
        background: #ffffff;
        font-family: Inter, Roboto, Arial, "DejaVu Sans", sans-serif;
        font-size: 10.5px;
        line-height: 1.42;
      }
      .masthead {
        display: flex; flex-direction: column; align-items: center;
        padding-bottom: 12px; margin-bottom: 13px;
        border-bottom: 1.5px solid #111111; break-inside: avoid;
      }
      .logo-img { max-width: 168px; max-height: 66px; object-fit: contain; }
      .masthead-name {
        font-size: 22px; font-weight: 800; letter-spacing: .16em;
        text-transform: uppercase; text-align: center;
      }
      .docrow {
        display: grid; grid-template-columns: 1fr auto; gap: 16px;
        align-items: start; break-inside: avoid;
      }
      .title {
        margin: 0; font-size: 20px; line-height: 1.1; letter-spacing: .12em;
        font-weight: 800; text-transform: uppercase;
      }
      .subtitle { margin-top: 2px; color: #777777; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }
      .doc-meta { min-width: 188px; text-align: right; }
      .meta-line { margin-top: 3px; color: #555555; font-size: 9.5px; }
      .meta-line b { color: #111111; }
      .status {
        display: inline-flex; margin-top: 7px; align-items: center;
        border: 1px solid #111111; border-radius: 999px; padding: 2px 10px;
        font-size: 9px; font-weight: 700;
      }
      .section { margin-top: 12px; }
      .photo-grid { display: flex; flex-wrap: wrap; gap: 8px; }
      .photo-cell { break-inside: avoid; page-break-inside: avoid; margin: 0; width: calc(33.33% - 6px); }
      .photo-cell.wide { width: 100%; }
      .photo-cell img { width: 100%; height: auto; border: 1px solid #e2e4e8; border-radius: 8px; display: block; }
      .photo-cell figcaption { text-align: center; font-size: 8px; color: #555; margin-top: 3px; }
      .photo-skipped { font-size: 8px; color: #888; margin-top: 6px; }
      .plan-ipr { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9.5px; }
      .plan-ipr th { background: #111; color: #fff; padding: 4px 8px; text-align: left; font-size: 8.5px; letter-spacing: .08em; text-transform: uppercase; }
      .plan-ipr td { border-bottom: 1px solid #ddd; padding: 4px 8px; }
      .plan-table-block { break-inside: avoid; page-break-inside: avoid; margin-top: 10px; }
      .plan-table-title { font-weight: 700; font-size: 10px; margin-bottom: 4px; }
      /* Full width, natural height: these are wide spreadsheet captures. */
      .plan-table-img { width: 100%; height: auto; border: 1px solid #ddd; border-radius: 6px; }
      .section.keep { break-inside: avoid; page-break-inside: avoid; }
      .section-title {
        margin: 0 0 6px; color: #666666; font-size: 8.5px; font-weight: 800;
        letter-spacing: .12em; text-transform: uppercase;
      }
      .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .box {
        min-width: 0; border: 1px solid #e2e4e8; border-radius: 10px;
        padding: 10px 11px; break-inside: avoid; page-break-inside: avoid;
      }
      .box-title {
        margin: 0 0 6px; font-size: 8.5px; font-weight: 800; color: #666666;
        letter-spacing: .12em; text-transform: uppercase;
      }
      .kv { display: grid; grid-template-columns: 148px 1fr; gap: 3px 12px; }
      .kv .k { color: #666666; }
      .kv .v { color: #111111; overflow-wrap: anywhere; white-space: pre-wrap; }
      .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }

      /* ── Odontogram ── */
      .odo-wrap { border: 1px solid #e2e4e8; border-radius: 10px; padding: 12px 10px 8px; }
      .odo-row { display: flex; justify-content: center; align-items: flex-end; gap: 2px; }
      .odo-row.upper { align-items: flex-end; margin-bottom: 3px; }
      .odo-row.lower { align-items: flex-start; padding-top: 3px; border-top: 1px dashed #d4d7dd; }
      .odo-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 42px; }
      .odo-glyph { position: relative; height: 40px; display: flex; align-items: flex-end; justify-content: center; }
      .odo-row.lower .odo-glyph { align-items: flex-start; }
      .odo-glyph svg { display: block; }
      .odo-band { position: absolute; inset: 0; display: flex; align-items: inherit; justify-content: center; }
      .odo-chip {
        display: inline-flex; align-items: center; gap: 2px;
        border-radius: 999px; padding: 0 4px; font-size: 6.8px; font-weight: 700;
        background: #f1f2f5; color: #333333; line-height: 1.6;
      }
      .odo-chip.on { color: #ffffff; }
      .odo-legend { display: flex; flex-wrap: wrap; gap: 5px 14px; justify-content: center; margin-top: 9px; }
      .odo-legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 8.5px; color: #333333; }
      .odo-swatch { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
      .odo-side-label { text-align: center; color: #999999; font-size: 7.5px; letter-spacing: .1em; text-transform: uppercase; margin: 2px 0; }

      table.files { width: 100%; border-collapse: collapse; }
      table.files th {
        text-align: left; font-size: 8px; letter-spacing: .1em; color: #666666;
        text-transform: uppercase; border-bottom: 1px solid #d4d7dd; padding: 3px 6px;
      }
      table.files td { padding: 3px 6px; border-bottom: 1px solid #eef0f3; font-size: 9.5px; overflow-wrap: anywhere; }
      table.files td.num { text-align: right; white-space: nowrap; }

      table.notes { width: 100%; border-collapse: collapse; margin-top: 8px; }
      table.notes th {
        text-align: left; font-size: 8px; letter-spacing: .1em; color: #666666;
        text-transform: uppercase; border-bottom: 1px solid #d4d7dd; padding: 3px 6px;
      }
      table.notes td { padding: 3px 6px; border-bottom: 1px solid #eef0f3; font-size: 9.5px; }

      .footer {
        margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e4e8;
        color: #999999; font-size: 8.5px; display: flex; justify-content: space-between;
      }
    </style>
  </head>
  <body>
    <div class="masthead">
      ${
        branding.logo
          ? `<img class="logo-img" src="${branding.logo}" alt="${this.htmlAttr(branding.brandName)}" />`
          : `<div class="masthead-name">${esc(branding.brandName)}</div>`
      }
    </div>
    <div class="docrow">
      <div>
        <h1 class="title">Fiche de commande</h1>
        <div class="subtitle">Order sheet</div>
        <span class="status">${esc(statusLabel)}</span>
      </div>
      <div class="doc-meta">
        ${metaRows
          .map(([k, v]) => `<div class="meta-line">${esc(k)} : <b>${esc(v)}</b></div>`)
          .join('')}
      </div>
    </div>

    <div class="section keep">
      <div class="party-grid">${patientBox}${doctorBox}</div>
    </div>

    <div class="section keep">
      <h2 class="section-title">Odontogramme · Dental chart</h2>
      ${odontogram}
    </div>

    <div class="section keep">
      <h2 class="section-title">Données cliniques · Clinical data</h2>
      <div class="box">${clinicalRows}</div>
    </div>

    <div class="section keep">
      <h2 class="section-title">Options de traitement · Treatment options</h2>
      <div class="box">${advancedRows}</div>
    </div>

    ${
      instructionRows
        ? `<div class="section keep">
      <h2 class="section-title">Instructions · Instructions</h2>
      <div class="box">${instructionRows}</div>
    </div>`
        : ''
    }

    <div class="section keep">
      <h2 class="section-title">Fabrication &amp; imagerie · Manufacturing &amp; imaging</h2>
      <div class="box">${manufacturingRows}</div>
    </div>

    ${this.renderClinicalPhotosSection(photoFiles)}

    ${this.renderApprovedPlanSection(approvedPlan)}

    ${filesTable}

    <div class="footer">
      <span>${esc(branding.brandName)} — fiche générée le ${this.fmtDate(new Date())}</span>
      <span>${esc(dto.orderCode)}</span>
    </div>
  </body>
</html>`;
  }

  // ─── Clinical photos ───────────────────────────────────────────

  /**
   * The uploaded clinical photos, embedded as actual images — the sheet
   * is meant to travel with the order, so the lab must SEE the case, not
   * read a filename list. Three rules keep the PDF sane:
   *
   *   • the compressed `md` variant is preferred, then `thumb`, then the
   *     original — but an original heavier than 2 MB is listed by name
   *     instead of embedded, so one phone photo can't balloon the file;
   *   • labels reuse the ZIP's mirrored RIGHT/LEFT swap, so the folder a
   *     lab tech opens and the caption they read never disagree;
   *   • the panoramic X-ray spans the full width; intraoral photos flow
   *     three to a row.
   */
  private renderClinicalPhotosSection(files: SheetPhotoFile[]): string {
    if (!files.length) return '';
    const esc = this.escapeHtml.bind(this);
    const MAX_ORIGINAL_BYTES = 2 * 1024 * 1024;

    const pickPath = (f: SheetPhotoFile): string | null => {
      const variants = (f.variants ?? {}) as Record<
        string,
        { path?: string } | undefined
      >;
      for (const name of ['md', 'thumb']) {
        const p = variants[name]?.path;
        if (p) return p;
      }
      // Original only when it is an image and not oversized.
      if (!/^image\//.test(f.mimeType)) return null;
      try {
        const normalized = f.relativePath.replace(/^[/\\]+/, '');
        const abs = path.resolve(UPLOAD_ROOT, normalized);
        if (!abs.startsWith(path.resolve(UPLOAD_ROOT))) return null;
        const stat = fs.statSync(abs);
        if (stat.size > MAX_ORIGINAL_BYTES) return null;
      } catch {
        return null;
      }
      return f.relativePath;
    };

    // Group by category so multiple shots of one view stay together and
    // get numbered captions.
    const counts = new Map<string, number>();
    const cells: string[] = [];
    const skipped: string[] = [];
    for (const f of files) {
      const src = this.resolveImageDataUrl(pickPath(f));
      const n = (counts.get(f.category) ?? 0) + 1;
      counts.set(f.category, n);
      const base = PHOTO_LABELS[f.category] ?? f.category;
      const label = n > 1 ? `${base} (${n})` : base;
      if (!src) {
        skipped.push(`${label} — ${f.originalName ?? f.relativePath}`);
        continue;
      }
      const wide = f.category === 'orthopantomography';
      cells.push(`<figure class="photo-cell${wide ? ' wide' : ''}">
        <img src="${src}" alt="" />
        <figcaption>${esc(label)}</figcaption>
      </figure>`);
    }
    if (!cells.length && !skipped.length) return '';

    const skippedNote = skipped.length
      ? `<div class="photo-skipped">Non intégrées (fichier lourd ou illisible) · Not embedded: ${esc(
          skipped.join(' ; '),
        )}</div>`
      : '';

    return `<div class="section">
      <h2 class="section-title">Photos cliniques · Clinical photos</h2>
      <div class="photo-grid">${cells.join('')}</div>
      ${skippedNote}
    </div>`;
  }

  // ─── Approved treatment plan ───────────────────────────────────

  /**
   * The treatment plan the DOCTOR APPROVED, rendered into the order
   * sheet so the lab works from one reference document: aligner counts,
   * the per-contact IPR table, and the planner's movement/treatment
   * table images embedded full-width (the same tables the doctor saw
   * when approving). Absent plan => absent section — a draft must never
   * masquerade as an approval.
   */
  private renderApprovedPlanSection(
    plan: (TreatmentPlan & { iprEntries: TreatmentPlanIpr[] }) | null,
  ): string {
    if (!plan) return '';
    const esc = this.escapeHtml.bind(this);

    const metaRows: [string, string][] = [
      ['Plan · Plan', `${plan.name} (v${plan.version})`],
      [
        'Approuvé le · Approved on',
        plan.approvedAt ? this.fmtDate(plan.approvedAt) : '—',
      ],
      [
        'Aligneurs maxillaire · Upper aligners',
        plan.totalUpperAligners != null ? String(plan.totalUpperAligners) : '—',
      ],
      [
        'Aligneurs mandibule · Lower aligners',
        plan.totalLowerAligners != null ? String(plan.totalLowerAligners) : '—',
      ],
    ];
    if (plan.createdByName) {
      metaRows.push(['Conçu par · Planned by', plan.createdByName]);
    }

    const meta = metaRows
      .map(
        ([k, v]) =>
          `<div class="meta-line">${esc(k)} : <b>${esc(v)}</b></div>`,
      )
      .join('');

    // IPR: one row per interproximal contact, mm kept as the exact
    // string the planner typed (trailing zeros are meaningful to them).
    const ipr = plan.iprEntries.length
      ? `<table class="plan-ipr">
          <thead>
            <tr>
              <th>Contact (FDI)</th>
              <th>IPR (mm)</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${plan.iprEntries
              .map(
                (e) => `<tr>
                  <td>${e.fromTooth} → ${e.toTooth}</td>
                  <td>${esc(e.value)}</td>
                  <td>${esc(e.note ?? '')}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>`
      : '';

    // The planner's own tables, embedded as full-width images — this is
    // what the reference document the clinic supplied shows on its last
    // page. Missing file on disk => the block is simply skipped.
    const tables = [
      ['Tableau des mouvements · Movement table', plan.movementTableImagePath],
      [
        'Tableau de traitement dentaire · Dental treatment table',
        plan.dentalTreatmentTableImagePath,
      ],
    ]
      .map(([title, rel]) => {
        const src = this.resolveImageDataUrl(rel ?? null);
        if (!src) return '';
        return `<div class="plan-table-block">
          <div class="plan-table-title">${esc(title ?? '')}</div>
          <img class="plan-table-img" src="${src}" alt="" />
        </div>`;
      })
      .join('');

    return `<div class="section keep">
      <h2 class="section-title">Plan de traitement approuvé · Approved treatment plan</h2>
      <div class="box">${meta}</div>
      ${ipr}
    </div>
    ${tables ? `<div class="section">${tables}</div>` : ''}`;
  }

  // ─── Odontogram rendering ──────────────────────────────────────

  private renderOdontogram(dto: OrderResponseDto): string {
    const marksByTooth = new Map<number, ToothInstructionType[]>();
    for (const inst of dto.toothInstructions ?? []) {
      const arr = marksByTooth.get(inst.toothNumber) ?? [];
      if (!arr.includes(inst.type)) arr.push(inst.type);
      marksByTooth.set(inst.toothNumber, arr);
    }

    const row = (teeth: number[], rowClass: 'upper' | 'lower') =>
      `<div class="odo-row ${rowClass}">${teeth
        .map((n) => this.renderTooth(n, rowClass, marksByTooth.get(n) ?? []))
        .join('')}</div>`;

    // Legend: only the instruction types actually present on the order.
    const presentTypes = [
      ...new Set([...marksByTooth.values()].flat()),
    ];
    const legend = presentTypes.length
      ? `<div class="odo-legend">${presentTypes
          .map((tp) => {
            const s = MARK_STYLES[tp];
            return `<span class="odo-legend-item"><span class="odo-swatch" style="background:${s.hex}"></span>${this.escapeHtml(
              `${s.labelFr} (${s.short})`,
            )}</span>`;
          })
          .join('')}</div>`
      : `<div class="odo-legend"><span class="odo-legend-item">Aucune instruction dentaire — no per-tooth instructions</span></div>`;

    // Per-tooth notes / values table (IPR mm, free-text notes).
    const noted = (dto.toothInstructions ?? []).filter(
      (i) => (i.note && i.note.trim()) || (i.value && String(i.value).trim()),
    );
    const notesTable = noted.length
      ? `<table class="notes">
          <thead><tr><th>Dent</th><th>Instruction</th><th>Valeur</th><th>Note</th></tr></thead>
          <tbody>${noted
            .map((i) => {
              const s = MARK_STYLES[i.type];
              return `<tr>
                <td>${i.toothNumber}</td>
                <td><span class="odo-swatch" style="background:${s.hex};margin-right:4px"></span>${this.escapeHtml(s.labelFr)}</td>
                <td>${this.escapeHtml(i.value ? String(i.value) : '—')}</td>
                <td>${this.escapeHtml(i.note?.trim() || '—')}</td>
              </tr>`;
            })
            .join('')}</tbody>
        </table>`
      : '';

    return `<div class="odo-wrap">
      <div class="odo-side-label">Maxillaire · Upper</div>
      ${row(UPPER_ROW, 'upper')}
      ${row(LOWER_ROW, 'lower')}
      <div class="odo-side-label">Mandibule · Lower</div>
      ${legend}
      ${notesTable}
    </div>`;
  }

  private renderTooth(
    toothNumber: number,
    rowClass: 'upper' | 'lower',
    types: ToothInstructionType[],
  ): string {
    const marks = types.map((tp) => MARK_STYLES[tp]);
    const first = marks[0];
    const chipStyle = first
      ? marks.length > 1
        ? `background:linear-gradient(to right, ${marks
            .map(
              (m, i) =>
                `${m.hex} ${(i / marks.length) * 100}%, ${m.hex} ${((i + 1) / marks.length) * 100}%`,
            )
            .join(', ')})`
        : `background:${first.hex}`
      : '';
    const chip = `<span class="odo-chip${first ? ' on' : ''}"${chipStyle ? ` style="${chipStyle}"` : ''}>${toothNumber}${
      first && marks.length === 1 ? `&nbsp;${first.short}` : ''
    }${marks.length > 1 ? `&nbsp;×${marks.length}` : ''}</span>`;

    const glyph = this.renderVectorGlyph(toothNumber, marks, rowClass);

    return `<div class="odo-cell">
      ${rowClass === 'upper' ? chip : ''}
      <div class="odo-glyph">${glyph}</div>
      ${rowClass === 'lower' ? chip : ''}
    </div>`;
  }

  /**
   * One tooth as a clean vector crown, shaped by its FDI type — incisor,
   * canine, premolar, molar. This replaced the photographic sprite: the
   * ~2 MB artwork rasterised muddy and distorted in print, while a
   * stylised crown (the convention of the clinic's own reference sheet)
   * stays crisp at any size and costs a few hundred bytes.
   *
   * Upper teeth point their occlusal edge DOWN (toward the opposing
   * arch), lower teeth up — standard dental-chart orientation. One mark
   * fills the crown with the instruction colour; several marks split it
   * into equal horizontal bands inside a clipPath of the crown outline.
   */
  private renderVectorGlyph(
    toothNumber: number,
    marks: MarkStyle[],
    rowClass: 'upper' | 'lower',
  ): string {
    // Crown outlines, occlusal edge at the TOP of the 24×36 viewBox.
    const CROWNS: Record<'incisor' | 'canine' | 'premolar' | 'molar', string> = {
      incisor: 'M7 4 L17 4 Q18 4 18 6 L18 25 Q18 33 12 33 Q6 33 6 25 L6 6 Q6 4 7 4 Z',
      canine: 'M12 3 Q13 3 14 5 L19 12 Q19.5 13 19.5 15 L19.5 25 Q19.5 33 12 33 Q4.5 33 4.5 25 L4.5 15 Q4.5 13 5 12 L10 5 Q11 3 12 3 Z',
      premolar: 'M8 6 Q10 3.5 12 6 Q14 3.5 16 6 Q19 7 19 11 L19 25 Q19 33 12 33 Q5 33 5 25 L5 11 Q5 7 8 6 Z',
      molar: 'M6 6.5 Q8 3.5 10 6 Q12 4 14 6 Q16 3.5 18 6.5 Q21 8 21 12 L21 26 Q21 33 12 33 Q3 33 3 26 L3 12 Q3 8 6 6.5 Z',
    };
    const digit = toothNumber % 10;
    const kind =
      digit <= 2 ? 'incisor' : digit === 3 ? 'canine' : digit <= 5 ? 'premolar' : 'molar';
    const d = CROWNS[kind];
    const clipId = `odo-clip-${toothNumber}`;

    // Fill: neutral ivory when unmarked; the instruction colour(s) when
    // marked — banded horizontally for multiple instructions.
    let fill: string;
    if (marks.length === 0) {
      fill = `<path d="${d}" fill="${DEFAULT_TOOTH}" />`;
    } else if (marks.length === 1) {
      fill = `<path d="${d}" fill="${marks[0].hex}" fill-opacity="0.85" />`;
    } else {
      const bandH = 36 / marks.length;
      fill = `<g clip-path="url(#${clipId})">${marks
        .map(
          (m, i) =>
            `<rect x="0" y="${(i * bandH).toFixed(1)}" width="24" height="${bandH.toFixed(1)}" fill="${m.hex}" fill-opacity="0.85" />`,
        )
        .join('')}</g>`;
    }

    const outline = marks[0]?.outline ?? DEFAULT_OUTLINE;
    // Upper arch: occlusal edge faces down => flip the crown vertically.
    const flip = rowClass === 'upper' ? ' transform="scale(1,-1) translate(0,-36)"' : '';

    return `<svg viewBox="0 0 24 36" width="26" height="38" aria-hidden="true">
      <defs><clipPath id="${clipId}"><path d="${d}" /></clipPath></defs>
      <g${flip}>${fill}<path d="${d}" fill="none" stroke="${outline}" stroke-width="1.4" /></g>
    </svg>`;
  }

  // ─── Field formatting ──────────────────────────────────────────

  /** French label for a stored English option value; falls back to raw. */
  private frValue(value?: string | null): string | undefined {
    const v = value?.trim();
    if (!v) return undefined;
    return VALUE_FR[v] ?? v;
  }

  /**
   * Unpack the chief-complaint string (canonical English condition
   * labels joined with ", ", free-text "Other" trailing) into French
   * labels. Legacy prose rows pass through untouched.
   */
  private formatChiefComplaint(packed?: string | null): string | undefined {
    const raw = packed?.trim();
    if (!raw) return undefined;
    const segments = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const known: string[] = [];
    const other: string[] = [];
    for (const seg of segments) {
      if (CONDITION_FR[seg]) known.push(CONDITION_FR[seg]);
      else other.push(seg);
    }
    if (!known.length) return raw;
    const parts = [...known];
    if (other.length) parts.push(other.join(', '));
    return parts.join(', ');
  }

  /** "Class II elastics — full-time wear" → "Élastiques classe II — full-time wear" */
  private formatElastics(value?: string | null): string | undefined {
    const v = value?.trim();
    if (!v) return undefined;
    const sep = v.indexOf(' — ');
    if (sep === -1) return VALUE_FR[v] ?? v;
    const type = v.slice(0, sep).trim();
    const notes = v.slice(sep + 3).trim();
    return `${VALUE_FR[type] ?? type}${notes ? ` — ${notes}` : ''}`;
  }

  private renderFilesTable(dto: OrderResponseDto): string {
    const files = dto.files ?? [];
    if (!files.length) return '';
    const rows = files
      .map((f) => {
        const cat = FILE_CATEGORY_FR[f.category] ?? f.category;
        return `<tr>
          <td>${this.escapeHtml(cat)}</td>
          <td>${this.escapeHtml(f.originalName ?? f.generatedName ?? '—')}</td>
          <td class="num">${this.fmtBytes(f.size)}</td>
        </tr>`;
      })
      .join('');
    return `<div class="section keep">
      <h2 class="section-title">Fichiers joints · Attached files (${files.length})</h2>
      <div class="box" style="padding:6px 8px">
        <table class="files">
          <thead><tr><th>Catégorie</th><th>Fichier</th><th style="text-align:right">Taille</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  // ─── Small helpers ─────────────────────────────────────────────

  /** Key/value grid rows; rows with empty values are dropped. */
  private kvRows(pairs: [string, string | null | undefined][]): string {
    const kept = pairs.filter(([k, v]) => k && v && String(v).trim());
    if (!kept.length) return '';
    return `<div class="kv">${kept
      .map(
        ([k, v]) =>
          `<span class="k">${this.escapeHtml(k)}</span><span class="v">${this.escapeHtml(String(v))}</span>`,
      )
      .join('')}</div>`;
  }

  private box(title: string, body: string): string {
    return `<div class="box"><h3 class="box-title">${this.escapeHtml(title)}</h3>${body || '<div class="kv"><span class="k">—</span><span class="v"></span></div>'}</div>`;
  }

  private fmtDate(value: Date | string): string {
    const d = typeof value === 'string' ? new Date(value) : value;
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private fmtAmount(value: number): string {
    return value.toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
  }

  private fmtBytes(bytes?: number | null): string {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private htmlAttr(value: string): string {
    return this.escapeHtml(value);
  }

  /** Local upload path → base64 data URL (same helper the invoice uses). */
  private resolveImageDataUrl(relativePath: string | null): string | null {
    if (!relativePath) return null;
    try {
      const normalized = relativePath.replace(/^[/\\]+/, '');
      const abs = path.resolve(UPLOAD_ROOT, normalized);
      if (!abs.startsWith(path.resolve(UPLOAD_ROOT))) return null;
      if (!fs.existsSync(abs)) return null;
      const ext = path.extname(abs).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.svg'
              ? 'image/svg+xml'
              : 'image/jpeg';
      return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
    } catch {
      return null;
    }
  }

  // ─── Puppeteer plumbing (cloned from InvoicePdfService) ────────

  private async renderHtmlToBuffer(html: string): Promise<Buffer> {
    let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      page.setDefaultTimeout(45_000);
      await page.setContent(html, { waitUntil: 'load', timeout: 45_000 });
      await page.emulateMediaType('print');
      const buffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    } catch (err) {
      this.logger.error(
        `Failed to render order sheet PDF: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    } finally {
      if (page) await page.close().catch(() => undefined);
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.launchBrowser().catch((err) => {
        this.browserPromise = null;
        throw err;
      });
    }
    return this.browserPromise;
  }

  private async launchBrowser(): Promise<Browser> {
    const executablePath = this.resolveChromiumExecutable();
    this.logger.log(`Launching Chromium PDF renderer at ${executablePath}`);
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=medium',
      ],
    });

    // Self-heal a dead renderer. `browserPromise` is only cleared when
    // the LAUNCH rejects, so without this a Chromium that dies later
    // (OOM-killed during a large export, crash) stays cached as a
    // resolved-but-dead handle: every later export fails and silently
    // falls back to order-data.json until the process restarts.
    browser.on('disconnected', () => {
      this.logger.warn('Chromium PDF renderer disconnected — will relaunch');
      this.browserPromise = null;
    });

    return browser;
  }

  private resolveChromiumExecutable(): string {
    const envCandidates = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      process.env.CHROME_BIN,
      process.env.CHROMIUM_PATH,
    ].filter(Boolean) as string[];

    const candidates = [
      ...envCandidates,
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome-stable',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(
        process.env.LOCALAPPDATA ?? '',
        'Google\\Chrome\\Application\\chrome.exe',
      ),
    ].filter(Boolean);

    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) return found;

    throw new Error(
      'Chromium executable was not found. Install chromium in Docker or set PUPPETEER_EXECUTABLE_PATH.',
    );
  }
}
