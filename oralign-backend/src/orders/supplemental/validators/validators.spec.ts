import {
  ArchTreatment,
  OrderFileCategory as File,
  OrderType,
  ReplacementReason,
  SupplementalApCorrection,
  SupplementalApOption,
  SupplementalContactPurpose,
  SupplementalAttachmentPlan,
  SupplementalClinicalObjective,
  SupplementalCutoutPlan,
  SupplementalExistingAttachments,
  SupplementalImpressionMethod,
  SupplementalIprPlan,
  SupplementalPreviousIpr,
  SupplementalRequestReason,
  SupplementalResidualSpaces,
  SupplementalTeethScope,
  SupplementalToothPurpose,
  SupplementalUrgency,
  TransferTemplatePurpose,
  WarrantyDefectCategory,
} from '@prisma/client';
import { BadRequestException } from '../../../common/exceptions/app.exception';
import {
  SUPPLEMENTAL_ERROR,
  SUPPLEMENTAL_ORDER_TYPES,
} from '../supplemental.constants';
import {
  calendarDayToDate,
  DRAFT_ANSWER_FIELDS,
  type SupplementalAnswers,
} from '../supplemental-draft';
import type { SupplementalOrderType } from '../supplemental.types';
import { assertSubmittable, SUBMISSION_VALIDATORS } from './index';
import type { SubmissionContext, SubmittedFile } from './submission-context';

// 2026-06-15 10:00 UTC is 11:00 in Tunis: "today" is 2026-06-15 there.
const NOW = new Date('2026-06-15T10:00:00.000Z');

/** A file uploaded through an upload slot of the shared uploader. */
const slot = (key: string, category: File): SubmittedFile => ({
  category,
  originalName: `${key}__IMG_0001.jpg`,
});
/** A file uploaded without a slot (an API client, an older upload). */
const loose = (category: File): SubmittedFile => ({
  category,
  originalName: 'IMG_0001.jpg',
});

const RIGHT = slot('right-lateral', File.right_photo);
const FRONTAL = slot('frontal-occlusion', File.front_photo);
const LEFT = slot('left-lateral', File.left_photo);
const UPPER = slot('upper-occlusal', File.upper_photo);
const LOWER = slot('lower-occlusal', File.lower_photo);
const PHOTOS = [RIGHT, FRONTAL, LEFT, UPPER, LOWER];
const UPPER_SCAN = slot('upper-stl', File.stl);

const blank = (): SupplementalAnswers => ({
  ...(Object.fromEntries(
    DRAFT_ANSWER_FIELDS.map((field) => [field, null]),
  ) as Record<keyof SupplementalAnswers, null>),
  apOptions: [],
});

/** Answers that pass, per kind. */
const COMPLETE: Record<SupplementalOrderType, Partial<SupplementalAnswers>> = {
  additional_aligners: {
    reason: SupplementalRequestReason.finishing,
    currentUpperAligner: 10,
    currentLowerAligner: 10,
    newUpperScan: true,
    newLowerScan: false,
    clinicalObjective: SupplementalClinicalObjective.adjust_current_position,
    movementRestriction: SupplementalTeethScope.none,
    apRelationshipRight: SupplementalApCorrection.maintain,
    apRelationshipLeft: SupplementalApCorrection.maintain,
    attachmentPolicy: SupplementalAttachmentPlan.as_needed,
    existingAttachmentPolicy: SupplementalExistingAttachments.keep_all,
    iprPolicy: SupplementalIprPlan.as_needed,
    previousIpr: SupplementalPreviousIpr.as_prescribed,
    precisionCutPolicy: SupplementalCutoutPlan.none,
    residualSpacePolicy: SupplementalResidualSpaces.none,
    impressionMethod: SupplementalImpressionMethod.intraoral_scan,
  },
  replacement: {
    replacementFromAligner: 4,
    replacementToAligner: 6,
    quantity: 1,
    replacementReason: ReplacementReason.lost,
    urgency: SupplementalUrgency.standard,
  },
  transfer_template: {
    sourceTreatmentPlanId: 'plan-2',
    transferPurpose: TransferTemplatePurpose.attachment_placement,
    quantity: 2,
  },
  warranty: {
    replacementFromAligner: 5,
    warrantyDefectCategory: WarrantyDefectCategory.crack,
    warrantyDiscoveredAt: calendarDayToDate('2026-06-10'),
    warrantyComments: 'Crack on the upper left molar region',
  },
};

const COMPLETE_ARCH: Record<SupplementalOrderType, ArchTreatment> = {
  additional_aligners: ArchTreatment.both,
  replacement: ArchTreatment.upper,
  transfer_template: ArchTreatment.both,
  warranty: ArchTreatment.lower,
};

const COMPLETE_FILES: Record<SupplementalOrderType, SubmittedFile[]> = {
  additional_aligners: [...PHOTOS, UPPER_SCAN],
  replacement: [],
  transfer_template: [],
  warranty: [loose(File.image)],
};

const COMPLETE_TEETH: Record<
  SupplementalOrderType,
  SubmissionContext['details']
> = {
  additional_aligners: { teeth: [], contacts: [] },
  replacement: { teeth: [], contacts: [] },
  transfer_template: {
    teeth: [
      { purpose: SupplementalToothPurpose.transfer_tray, toothNumber: 11 },
    ],
    contacts: [],
  },
  warranty: { teeth: [], contacts: [] },
};

function context(
  type: SupplementalOrderType,
  over: {
    answers?: Partial<SupplementalAnswers>;
    archTreatment?: ArchTreatment | null;
    files?: SubmittedFile[];
    details?: SubmissionContext['details'];
    parent?: Partial<SubmissionContext['parent']>;
  } = {},
): SubmissionContext {
  return {
    type,
    archTreatment:
      over.archTreatment === undefined
        ? COMPLETE_ARCH[type]
        : over.archTreatment,
    answers: { ...blank(), ...COMPLETE[type], ...over.answers },
    details: over.details ?? COMPLETE_TEETH[type],
    files: over.files ?? COMPLETE_FILES[type],
    parent: {
      createdAt: new Date('2026-01-10T09:00:00.000Z'),
      totalAligners: 30,
      approvedPlans: [
        {
          id: 'plan-2',
          version: 2,
          approvedAt: null,
          totalUpperAligners: 24,
          totalLowerAligners: 22,
        },
      ],
      quotation: null,
      deliveredUpTo: 12,
      ...over.parent,
    },
    now: NOW,
  };
}

const problemsOf = (ctx: SubmissionContext) =>
  SUBMISSION_VALIDATORS[ctx.type](ctx);

describe.each(SUPPLEMENTAL_ORDER_TYPES)('a complete %s request', (type) => {
  it('has no problem', () => {
    expect(problemsOf(context(type))).toEqual([]);
    expect(() => assertSubmittable(context(type))).not.toThrow();
  });
});

describe('additional aligners', () => {
  const type = OrderType.additional_aligners;

  it('lists every unanswered question at once', () => {
    const problems = problemsOf(
      context(type, { answers: blank(), archTreatment: null, files: [] }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'reason:required',
        'archTreatment:required',
        'newUpperScan:required',
        'newLowerScan:required',
        'clinicalObjective:required',
        'movementRestriction:required',
        'apRelationshipRight:required',
        'apRelationshipLeft:required',
        'attachmentPolicy:required',
        'existingAttachmentPolicy:required',
        'iprPolicy:required',
        'previousIpr:required',
        'precisionCutPolicy:required',
        'residualSpacePolicy:required',
        'impressionMethod:required',
        'photos:required',
      ]),
    );
  });

  it.each<[string, Parameters<typeof context>[1], string[]]>([
    [
      '"other" reason without details',
      { answers: { reason: SupplementalRequestReason.other } },
      ['reasonDetails:required'],
    ],
    [
      'current aligner beyond the plan (upper 24)',
      { answers: { currentUpperAligner: 25 }, parent: { deliveredUpTo: null } },
      ['currentUpperAligner:out_of_range'],
    ],
    [
      'current aligner beyond what was delivered (12)',
      { answers: { currentLowerAligner: 13 } },
      ['currentLowerAligner:out_of_range'],
    ],
    [
      'no current lower aligner while the lower arch is treated',
      { answers: { currentLowerAligner: null } },
      ['currentLowerAligner:required'],
    ],
    [
      'one arch without the passive-opposite answer',
      { archTreatment: ArchTreatment.upper },
      ['passiveOppositeArch:required'],
    ],
    [
      'a new goal without instructions',
      {
        answers: { clinicalObjective: SupplementalClinicalObjective.new_goal },
      },
      ['instructions:required'],
    ],
    [
      'a treatment plan change without instructions',
      {
        answers: { reason: SupplementalRequestReason.treatment_plan_change },
      },
      ['instructions:required'],
    ],
    [
      'a canine + molar correction without instructions',
      {
        answers: {
          apRelationshipLeft: SupplementalApCorrection.improve_canine_molar,
        },
      },
      ['instructions:required'],
    ],
    [
      'elastics without the cut-out answer',
      { answers: { apOptions: [SupplementalApOption.elastics_simulation] } },
      ['elasticCutouts:required'],
    ],
    [
      'selected teeth not to move, none picked',
      {
        answers: { movementRestriction: SupplementalTeethScope.selected_teeth },
      },
      ['teeth.do_not_move:required'],
    ],
    [
      'different IPR performed, no contact',
      { answers: { previousIpr: SupplementalPreviousIpr.different } },
      ['contacts.performed_ipr:required'],
    ],
    [
      'two new scans, one file',
      { answers: { newLowerScan: true } },
      ['scans:required'],
    ],
    [
      'one photo missing',
      { files: [...PHOTOS.slice(1), UPPER_SCAN] },
      ['photos:required'],
    ],
    [
      'the extraoral profile and smile instead of the left and frontal views',
      {
        files: [
          RIGHT,
          UPPER,
          LOWER,
          slot('profile', File.left_photo),
          slot('smile', File.front_photo),
          UPPER_SCAN,
        ],
      },
      ['photos:required'],
    ],
    [
      'unprefixed frontal and left photos (their categories are shared)',
      {
        files: [
          RIGHT,
          UPPER,
          LOWER,
          loose(File.front_photo),
          loose(File.left_photo),
          UPPER_SCAN,
        ],
      },
      ['photos:required'],
    ],
    [
      'two new scans, only the bite registrations uploaded',
      {
        answers: { newLowerScan: true },
        files: [
          ...PHOTOS,
          slot('first-occlusion', File.stl),
          slot('second-occlusion', File.stl),
        ],
      },
      ['scans:required'],
    ],
    [
      'lower teeth on an upper-only refinement',
      {
        archTreatment: ArchTreatment.upper,
        answers: {
          passiveOppositeArch: false,
          movementRestriction: SupplementalTeethScope.selected_teeth,
          residualSpacePolicy: SupplementalResidualSpaces.close_specified,
        },
        details: {
          teeth: [
            { purpose: SupplementalToothPurpose.do_not_move, toothNumber: 13 },
            { purpose: SupplementalToothPurpose.do_not_move, toothNumber: 36 },
            { purpose: SupplementalToothPurpose.do_not_move, toothNumber: 46 },
          ],
          contacts: [
            {
              purpose: SupplementalContactPurpose.residual_space,
              fromTooth: 31,
              toTooth: 41,
              amountMm: 0.5,
            },
          ],
        },
      },
      ['teeth.do_not_move:invalid', 'contacts.residual_space:invalid'],
    ],
  ])('%s', (_, over, expected) => {
    expect(problemsOf(context(type, over))).toEqual(expected);
  });

  it('a lower-only refinement needs no current upper aligner', () => {
    expect(
      problemsOf(
        context(type, {
          archTreatment: ArchTreatment.lower,
          answers: { currentUpperAligner: null, passiveOppositeArch: false },
        }),
      ),
    ).toEqual([]);
  });

  it('unprefixed files fill the slots whose category no other slot shares', () => {
    expect(
      problemsOf(
        context(type, {
          files: [
            loose(File.right_photo),
            FRONTAL,
            LEFT,
            loose(File.upper_photo),
            loose(File.lower_photo),
            loose(File.zip),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('counts one arch scan per rescanned arch, bite registrations aside', () => {
    expect(
      problemsOf(
        context(type, {
          answers: { newLowerScan: true },
          files: [
            ...PHOTOS,
            UPPER_SCAN,
            slot('lower-stl', File.stl),
            slot('first-occlusion', File.stl),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('a physical impression needs no scan file', () => {
    expect(
      problemsOf(
        context(type, {
          answers: {
            impressionMethod: SupplementalImpressionMethod.physical_impression,
          },
          files: PHOTOS,
        }),
      ),
    ).toEqual([]);
  });
});

describe('replacement', () => {
  const type = OrderType.replacement;

  it.each<[string, Parameters<typeof context>[1], string[]]>([
    [
      'both arches within both plans',
      { archTreatment: ArchTreatment.both },
      [],
    ],
    ['no arch', { archTreatment: null }, ['archTreatment:required']],
    [
      'a range that ends before it starts',
      { answers: { replacementFromAligner: 7, replacementToAligner: 6 } },
      ['replacementToAligner:invalid'],
    ],
    [
      'an aligner never delivered',
      { answers: { replacementToAligner: 13 } },
      ['replacementToAligner:out_of_range'],
    ],
    [
      'beyond the lower plan when both arches (22)',
      {
        archTreatment: ArchTreatment.both,
        answers: { replacementToAligner: 23 },
        parent: { deliveredUpTo: null },
      },
      ['replacementToAligner:out_of_range'],
    ],
    [
      'no range',
      { answers: { replacementFromAligner: null, replacementToAligner: null } },
      ['replacementFromAligner:required', 'replacementToAligner:required'],
    ],
    [
      'eleven per aligner',
      { answers: { quantity: 11 } },
      ['quantity:out_of_range'],
    ],
    [
      '"other" reason without details',
      { answers: { replacementReason: ReplacementReason.other } },
      ['reasonDetails:required'],
    ],
    ['no urgency', { answers: { urgency: null } }, ['urgency:required']],
  ])('%s', (_, over, expected) => {
    expect(problemsOf(context(type, over))).toEqual(expected);
  });

  it('without deliveries, only the plan bounds the range', () => {
    expect(
      problemsOf(
        context(type, {
          answers: { replacementToAligner: 20 },
          parent: { deliveredUpTo: null },
        }),
      ),
    ).toEqual([]);
  });
});

describe('transfer template', () => {
  const type = OrderType.transfer_template;

  it.each<[string, Parameters<typeof context>[1], string[]]>([
    [
      'a plan that is not an approved plan of the case',
      { answers: { sourceTreatmentPlanId: 'plan-x' } },
      ['sourceTreatmentPlanId:invalid'],
    ],
    [
      'no source plan',
      { answers: { sourceTreatmentPlanId: null } },
      ['sourceTreatmentPlanId:required'],
    ],
    [
      '"other" purpose without notes',
      { answers: { transferPurpose: TransferTemplatePurpose.other } },
      ['transferNotes:required'],
    ],
    ['six trays', { answers: { quantity: 6 } }, ['quantity:out_of_range']],
    [
      'no tray tooth',
      { details: { teeth: [], contacts: [] } },
      ['teeth.transfer_tray:required'],
    ],
    [
      'a lower tray tooth on an upper tray',
      {
        archTreatment: ArchTreatment.upper,
        details: {
          teeth: [
            {
              purpose: SupplementalToothPurpose.transfer_tray,
              toothNumber: 13,
            },
            {
              purpose: SupplementalToothPurpose.transfer_tray,
              toothNumber: 33,
            },
          ],
          contacts: [],
        },
      },
      ['teeth.transfer_tray:invalid'],
    ],
  ])('%s', (_, over, expected) => {
    expect(problemsOf(context(type, over))).toEqual(expected);
  });
});

describe('warranty', () => {
  const type = OrderType.warranty;

  it.each<[string, Parameters<typeof context>[1], string[]]>([
    [
      'both arches',
      { archTreatment: ArchTreatment.both },
      ['archTreatment:invalid'],
    ],
    [
      'a defective aligner never delivered',
      { answers: { replacementFromAligner: 13 } },
      ['replacementFromAligner:out_of_range'],
    ],
    [
      'a defective aligner beyond the lower plan (22)',
      {
        answers: { replacementFromAligner: 23 },
        parent: { deliveredUpTo: 30 },
      },
      ['replacementFromAligner:out_of_range'],
    ],
    [
      'found tomorrow (Tunis calendar)',
      { answers: { warrantyDiscoveredAt: calendarDayToDate('2026-06-16') } },
      ['warrantyDiscoveredAt:out_of_range'],
    ],
    [
      'found before the case existed',
      { answers: { warrantyDiscoveredAt: calendarDayToDate('2026-01-09') } },
      ['warrantyDiscoveredAt:out_of_range'],
    ],
    ['no evidence photo', { files: [UPPER_SCAN] }, ['evidencePhotos:required']],
    [
      'no comments',
      { answers: { warrantyComments: null } },
      ['warrantyComments:required'],
    ],
  ])('%s', (_, over, expected) => {
    expect(problemsOf(context(type, over))).toEqual(expected);
  });

  it('accepts a defect found today and the creation day, lot reference optional', () => {
    for (const day of ['2026-06-15', '2026-01-10']) {
      expect(
        problemsOf(
          context(type, {
            answers: {
              warrantyDiscoveredAt: calendarDayToDate(day),
              warrantyLotReference: null,
            },
          }),
        ),
      ).toEqual([]);
    }
  });
});

describe('assertSubmittable', () => {
  it('throws ONE SUPPLEMENTAL_INCOMPLETE listing every problem', () => {
    let error: unknown;
    try {
      assertSubmittable(
        context(OrderType.warranty, {
          answers: { warrantyComments: null },
          files: [],
        }),
      );
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toMatchObject({
      errorCode: SUPPLEMENTAL_ERROR.INCOMPLETE,
      message:
        'The request is incomplete: warrantyComments:required, evidencePhotos:required',
    });
  });
});

describe('requests on a case with no approved plan on file', () => {
  it('lets a transfer tray go without a source plan', () => {
    const problems = problemsOf(
      context(OrderType.transfer_template, {
        answers: {
          sourceTreatmentPlanId: null,
        },
        parent: { approvedPlans: [] },
      }),
    );
    expect(problems.some((p) => p.startsWith('sourceTreatmentPlanId:'))).toBe(
      false,
    );
  });

  it('bounds aligner numbers by the pack when the plan is missing', () => {
    const problems = problemsOf(
      context(OrderType.replacement, {
        answers: { replacementFromAligner: 11, replacementToAligner: 11 },
        parent: {
          approvedPlans: [],
          deliveredUpTo: null,
          quotation: {
            status: 'approved',
            paymentStatus: 'paid',
            treatmentValidityMonths: 12,
            includedCorrections: 2,
            isUnlimitedCorrections: false,
            maxStepsPerArch: 10,
            isUnlimitedSteps: false,
          },
        },
      }),
    );
    expect(problems).toContain('replacementToAligner:out_of_range');
  });
});
