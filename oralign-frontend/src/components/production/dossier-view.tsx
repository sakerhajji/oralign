'use client';

import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatChiefComplaint } from '@/lib/chief-complaint';
import { productionPaths } from '@/lib/api/production.service';
import { useT } from '@/lib/i18n/lang-context';
import type {
  ProductionDossier,
  ProductionPlanView,
  ProductionSupplementalAnswers,
  ProductionToothInstructionView,
} from '@/lib/types/production';
import { formatBusinessDay, formatCalendarDay } from '@/lib/utils/business-day';
import { DossierFiles, PlanAttachmentList, PlanTableImage } from './dossier-files';
import { ARCHES, type Translate } from './production-format';
import { Fact, ProductionKindBadge, ProductionSection } from './production-ui';

/**
 * The finance-free case file (owner D9): who the patient is (name, sex,
 * age), the practitioner, the request, the approved plan, the files and
 * a supplemental request's clinical answers. Read-only: nothing here
 * writes, and no contact data or money ever reaches it.
 */
export function DossierView({ dossier }: { dossier: ProductionDossier }) {
  const { t } = useT();
  const { order } = dossier;
  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
            {t('production.dossier.title')} · {order.orderCode}
          </h1>
          <ProductionKindBadge orderType={order.orderType} />
          <Badge variant="outline" className="text-muted-foreground">
            {t('production.dossier.readOnly')}
          </Badge>
        </div>
        <p className="text-base font-medium">{dossier.patient.fullName}</p>
        {order.parentOrderCode && (
          <p className="text-sm text-muted-foreground">
            {t('production.queue.supplementalOf', { code: order.parentOrderCode })}
          </p>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <PatientCard dossier={dossier} />
        <PractitionerCard dossier={dossier} />
      </div>

      <RequestSection dossier={dossier} />

      {dossier.supplementalRequest && <SupplementalSection answers={dossier.supplementalRequest} />}

      {dossier.toothInstructions.length > 0 && <TeethSection instructions={dossier.toothInstructions} />}

      <PlanSection orderId={order.orderId} plan={dossier.plan} />

      <ProductionSection id="files" title={t('production.dossier.files.title')}>
        <DossierFiles orderId={order.orderId} files={dossier.files} />
      </ProductionSection>
    </>
  );
}

function FactGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>;
}

function PatientCard({ dossier }: { dossier: ProductionDossier }) {
  const { t } = useT();
  const { patient } = dossier;
  return (
    <ProductionSection id="patient" title={t('production.dossier.patient.title')}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Fact label={t('production.dossier.patient.name')} wide>
          {patient.fullName}
        </Fact>
        <Fact label={t('production.dossier.patient.gender')}>
          {patient.gender ? t(`production.dossier.patient.genders.${patient.gender}`) : null}
        </Fact>
        <Fact label={t('production.dossier.patient.age')}>
          {patient.age !== null ? t('production.dossier.patient.ageValue', { age: patient.age }) : null}
        </Fact>
      </dl>
    </ProductionSection>
  );
}

function PractitionerCard({ dossier }: { dossier: ProductionDossier }) {
  const { t } = useT();
  return (
    <ProductionSection id="practitioner" title={t('production.dossier.practitioner.title')}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Fact label={t('production.dossier.practitioner.name')}>{dossier.practitioner.fullName}</Fact>
        <Fact label={t('production.dossier.practitioner.clinic')}>{dossier.practitioner.clinicName}</Fact>
      </dl>
    </ProductionSection>
  );
}

const CLINICAL_FIELDS = [
  'treatmentPlan',
  'dontMoveOption',
  'apRelationship',
  'anteroposteriorRelationship',
  'elastics',
  'openBite',
  'midline',
  'ipr',
  'biteRamps',
  'expansion',
  'crossbite',
  'spaces',
  'extractions',
  'specialInstructions',
  'additionalInstructions',
] as const;

function yesNo(t: Translate, value: boolean): string {
  return t(value ? 'production.dossier.order.yes' : 'production.dossier.order.no');
}

function RequestSection({ dossier }: { dossier: ProductionDossier }) {
  const { t, lang } = useT();
  const { order } = dossier;
  const complaint = formatChiefComplaint(order.chiefComplaint, t);
  const clinical = CLINICAL_FIELDS.filter((field) => order[field]?.trim());
  return (
    <ProductionSection id="request" title={t('production.dossier.order.title')}>
      <FactGrid>
        <Fact label={t('production.dossier.order.created')}>{formatBusinessDay(order.createdAt, lang)}</Fact>
        <Fact label={t('production.dossier.order.submitted')}>
          {order.submittedAt ? formatBusinessDay(order.submittedAt, lang) : null}
        </Fact>
        <Fact label={t('production.dossier.order.stage')}>
          {order.patientStage ? t(`production.dossier.order.stages.${order.patientStage}`) : null}
        </Fact>
        <Fact label={t('production.dossier.order.arches')}>
          {ARCHES.filter((arch) => order.treatedArches.includes(arch))
            .map((arch) => t(`production.arches.${arch}`))
            .join(', ')}
        </Fact>
        <Fact label={t('production.dossier.order.totalAligners')}>
          {order.totalAligners !== null ? String(order.totalAligners) : null}
        </Fact>
        <Fact label={t('production.dossier.order.materials')}>{order.materials.join(', ')}</Fact>
        <Fact label={t('production.dossier.order.cbct')}>{yesNo(t, order.useCbctWithScans)}</Fact>
        <Fact label={t('production.dossier.order.manufacturing')}>{yesNo(t, order.wantsManufacturing)}</Fact>
      </FactGrid>

      <h3 className="mt-5 mb-3 border-t pt-4 text-xs font-medium text-muted-foreground">
        {t('production.dossier.order.clinicalTitle')}
      </h3>
      {complaint || clinical.length > 0 ? (
        <FactGrid>
          {complaint && (
            <Fact label={t('production.dossier.order.fields.chiefComplaint')} wide>
              {complaint}
            </Fact>
          )}
          {clinical.map((field) => (
            <Fact
              key={field}
              label={t(`production.dossier.order.fields.${field}`)}
              wide={field === 'specialInstructions' || field === 'additionalInstructions' || field === 'treatmentPlan'}
            >
              {order[field]}
            </Fact>
          ))}
        </FactGrid>
      ) : (
        <p className="text-sm text-muted-foreground">{t('production.dossier.order.clinicalEmpty')}</p>
      )}
    </ProductionSection>
  );
}

function TeethSection({ instructions }: { instructions: ProductionToothInstructionView[] }) {
  const { t } = useT();
  const byType = new Map<string, ProductionToothInstructionView[]>();
  for (const item of instructions) {
    const list = byType.get(item.type);
    if (list) list.push(item);
    else byType.set(item.type, [item]);
  }
  return (
    <ProductionSection id="teeth" title={t('production.dossier.teeth.title')}>
      <dl className="flex flex-col gap-3">
        {[...byType.entries()].map(([type, items]) => (
          <div key={type} className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <dt className="text-xs text-muted-foreground sm:w-44 sm:shrink-0 sm:pt-0.5">
              {t(`production.dossier.teeth.types.${type}`)}
            </dt>
            <dd className="flex flex-wrap gap-1.5">
              {items
                .slice()
                .sort((a, b) => a.toothNumber - b.toothNumber)
                .map((item) => (
                  <Badge
                    key={`${item.toothNumber}-${item.value ?? ''}`}
                    variant="outline"
                    className="h-auto py-0.5 tabular-nums"
                    title={item.note ?? undefined}
                  >
                    {item.toothNumber}
                    {item.value ? ` · ${item.value}` : ''}
                  </Badge>
                ))}
            </dd>
          </div>
        ))}
      </dl>
    </ProductionSection>
  );
}

/** Only an http(s) link is ever rendered (never a javascript: URL). */
function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function PlanSection({ orderId, plan }: { orderId: string; plan: ProductionPlanView | null }) {
  const { t, lang } = useT();
  if (!plan) {
    return (
      <ProductionSection id="plan" title={t('production.dossier.plan.title')}>
        <p className="text-sm text-muted-foreground">{t('production.dossier.plan.none')}</p>
      </ProductionSection>
    );
  }
  const resultUrl = safeExternalUrl(plan.resultViewUrl);
  return (
    <ProductionSection
      id="plan"
      title={t('production.dossier.plan.title')}
      action={
        resultUrl ? (
          <Button asChild variant="outline" className="h-12 pointer-fine:md:h-8">
            <a href={resultUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" />
              {t('production.dossier.plan.resultView')}
            </a>
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <FactGrid>
          <Fact label={t('production.dossier.plan.name')}>
            {[
              plan.name,
              t('production.dossier.plan.version', { version: plan.version }),
              plan.approvedAt
                ? t('production.dossier.plan.approvedOn', { date: formatBusinessDay(plan.approvedAt, lang) })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Fact>
          <Fact label={t('production.dossier.plan.totals')}>
            {[
              plan.totalUpperAligners !== null
                ? `${t('production.arches.upper')} ${plan.totalUpperAligners}`
                : null,
              plan.totalLowerAligners !== null
                ? `${t('production.arches.lower')} ${plan.totalLowerAligners}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Fact>
        </FactGrid>

        {(plan.hasMovementTable || plan.hasDentalTable) && (
          <div className="grid gap-4 md:grid-cols-2">
            {plan.hasMovementTable && (
              <PlanTableImage
                path={productionPaths.movementTableImage(orderId)}
                title={t('production.dossier.plan.movementTable')}
              />
            )}
            {plan.hasDentalTable && (
              <PlanTableImage
                path={productionPaths.dentalTableImage(orderId)}
                title={t('production.dossier.plan.dentalTable')}
              />
            )}
          </div>
        )}

        {plan.ipr.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">{t('production.dossier.plan.ipr')}</h3>
            <ul className="flex flex-wrap gap-1.5">
              {plan.ipr.map((entry) => (
                <li key={`${entry.fromTooth}-${entry.toTooth}`}>
                  <Badge variant="outline" className="h-auto py-0.5 tabular-nums" title={entry.note ?? undefined}>
                    {t('production.dossier.plan.iprRow', {
                      from: entry.fromTooth,
                      to: entry.toTooth,
                      value: entry.value,
                    })}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">{t('production.dossier.plan.files')}</h3>
          <PlanAttachmentList orderId={orderId} attachments={plan.attachments} />
        </div>
      </div>
    </ProductionSection>
  );
}

function SupplementalSection({ answers }: { answers: ProductionSupplementalAnswers }) {
  const { t, lang } = useT();
  const v = (group: string, value: string | null) =>
    value ? t(`production.dossier.supplemental.values.${group}.${value}`) : null;
  const bool = (value: boolean | null) =>
    value === null
      ? null
      : t(value ? 'production.dossier.supplemental.yes' : 'production.dossier.supplemental.no');
  const f = (key: string) => t(`production.dossier.supplemental.fields.${key}`);
  const current =
    answers.currentUpperAligner !== null || answers.currentLowerAligner !== null
      ? t('production.dossier.supplemental.fields.currentValue', {
          upper: answers.currentUpperAligner ?? '—',
          lower: answers.currentLowerAligner ?? '—',
        })
      : null;
  const newScans =
    answers.newUpperScan === null && answers.newLowerScan === null
      ? null
      : [
          answers.newUpperScan ? t('production.arches.upper') : null,
          answers.newLowerScan ? t('production.arches.lower') : null,
        ]
          .filter(Boolean)
          .join(', ') || t('production.dossier.supplemental.no');
  const replacement =
    answers.replacementFromAligner !== null && answers.replacementToAligner !== null
      ? t('production.dossier.supplemental.fields.replacementValue', {
          from: answers.replacementFromAligner,
          to: answers.replacementToAligner,
        })
      : null;

  const facts: { key: string; label: string; value: ReactNode; wide?: boolean }[] = [
    { key: 'reason', label: f('reason'), value: v('reason', answers.reason) },
    { key: 'reasonDetails', label: f('reasonDetails'), value: answers.reasonDetails, wide: true },
    { key: 'current', label: f('currentAligners'), value: current },
    { key: 'passive', label: f('passiveOppositeArch'), value: bool(answers.passiveOppositeArch) },
    { key: 'scans', label: f('newScans'), value: newScans },
    { key: 'objective', label: f('clinicalObjective'), value: v('clinicalObjective', answers.clinicalObjective) },
    { key: 'restriction', label: f('movementRestriction'), value: v('teethScope', answers.movementRestriction) },
    { key: 'apRight', label: f('apRight'), value: v('apCorrection', answers.apRelationshipRight) },
    { key: 'apLeft', label: f('apLeft'), value: v('apCorrection', answers.apRelationshipLeft) },
    {
      key: 'apOptions',
      label: f('apOptions'),
      value: answers.apOptions.map((option) => v('apOption', option)).join(', '),
    },
    { key: 'cutouts', label: f('elasticCutouts'), value: bool(answers.elasticCutouts) },
    { key: 'attachments', label: f('attachmentPolicy'), value: v('attachmentPlan', answers.attachmentPolicy) },
    {
      key: 'existing',
      label: f('existingAttachmentPolicy'),
      value: v('existingAttachments', answers.existingAttachmentPolicy),
    },
    { key: 'ipr', label: f('iprPolicy'), value: v('iprPlan', answers.iprPolicy) },
    { key: 'previousIpr', label: f('previousIpr'), value: v('previousIpr', answers.previousIpr) },
    { key: 'precision', label: f('precisionCutPolicy'), value: v('cutoutPlan', answers.precisionCutPolicy) },
    { key: 'residual', label: f('residualSpacePolicy'), value: v('residualSpaces', answers.residualSpacePolicy) },
    { key: 'upper', label: f('upperInstructions'), value: answers.upperInstructions, wide: true },
    { key: 'lower', label: f('lowerInstructions'), value: answers.lowerInstructions, wide: true },
    { key: 'impression', label: f('impressionMethod'), value: v('impressionMethod', answers.impressionMethod) },
    { key: 'replacement', label: f('replacementRange'), value: replacement },
    { key: 'quantity', label: f('quantity'), value: answers.quantity !== null ? String(answers.quantity) : null },
    { key: 'replacementReason', label: f('replacementReason'), value: v('replacementReason', answers.replacementReason) },
    { key: 'urgency', label: f('urgency'), value: v('urgency', answers.urgency) },
    {
      key: 'sourcePlan',
      label: f('sourcePlan'),
      value:
        answers.sourceTreatmentPlanVersion !== null
          ? t('production.dossier.plan.version', { version: answers.sourceTreatmentPlanVersion })
          : null,
    },
    { key: 'transferPurpose', label: f('transferPurpose'), value: v('transferPurpose', answers.transferPurpose) },
    { key: 'transferNotes', label: f('transferNotes'), value: answers.transferNotes, wide: true },
    {
      key: 'defective',
      label: f('defectiveAligners'),
      value: answers.defectiveAligners.length ? answers.defectiveAligners.join(', ') : null,
    },
    { key: 'defect', label: f('defectCategory'), value: v('defect', answers.warrantyDefectCategory) },
    {
      key: 'discovered',
      label: f('discoveredAt'),
      value: answers.warrantyDiscoveredAt
        ? /^\d{4}-\d{2}-\d{2}$/.test(answers.warrantyDiscoveredAt)
          ? formatCalendarDay(answers.warrantyDiscoveredAt, lang, 'full')
          : formatBusinessDay(answers.warrantyDiscoveredAt, lang)
        : null,
    },
    { key: 'lot', label: f('lotReference'), value: answers.warrantyLotReference },
    { key: 'comments', label: f('comments'), value: answers.warrantyComments, wide: true },
    {
      key: 'teeth',
      label: f('teeth'),
      value: answers.teeth.length
        ? answers.teeth
            .map((tooth) => `${tooth.toothNumber} (${v('toothPurpose', tooth.purpose)})`)
            .join(', ')
        : null,
      wide: true,
    },
    {
      key: 'contacts',
      label: f('contacts'),
      value: answers.contacts.length
        ? answers.contacts
            .map(
              (contact) =>
                `${v('contactPurpose', contact.purpose)} ${t('production.dossier.supplemental.fields.contactRow', {
                  from: contact.fromTooth,
                  to: contact.toTooth,
                  mm: contact.iprMm,
                })}`,
            )
            .join(' · ')
        : null,
      wide: true,
    },
  ];
  const shown = facts.filter(
    (fact) => fact.value !== null && fact.value !== undefined && fact.value !== '',
  );

  return (
    <ProductionSection id="supplemental" title={t('production.dossier.supplemental.title')}>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('production.dossier.empty')}</p>
      ) : (
        <FactGrid>
          {shown.map((fact) => (
            <Fact key={fact.key} label={fact.label} wide={fact.wide}>
              {fact.value}
            </Fact>
          ))}
        </FactGrid>
      )}
    </ProductionSection>
  );
}
