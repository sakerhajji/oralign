import {
  ArchTreatment,
  OrderType,
  SupplementalApOption,
  SupplementalContactPurpose,
  SupplementalRequestReason,
  SupplementalTeethScope,
  SupplementalToothPurpose,
  SupplementalUrgency,
} from '@prisma/client';
import type { UpdateSupplementalOrderDto } from '../dto/supplemental-order.dto';
import {
  applyDraftUpdate,
  calendarDayToDate,
  dateToCalendarDay,
  DRAFT_ANSWER_FIELDS,
  draftChanges,
  draftUpdateFromDto,
  type DraftState,
  type SupplementalAnswers,
} from './supplemental-draft';

const blankAnswers = (): SupplementalAnswers => ({
  ...(Object.fromEntries(
    DRAFT_ANSWER_FIELDS.map((field) => [field, null]),
  ) as Record<keyof SupplementalAnswers, null>),
  apOptions: [],
  defectiveAligners: [],
});

const draft = (over: Partial<DraftState> = {}): DraftState => ({
  archTreatment: ArchTreatment.both,
  answers: {
    ...blankAnswers(),
    movementRestriction: SupplementalTeethScope.selected_teeth,
    reason: SupplementalRequestReason.finishing,
    upperInstructions: 'Close the 13-14 space',
  },
  details: {
    teeth: [{ purpose: SupplementalToothPurpose.do_not_move, toothNumber: 13 }],
    contacts: [],
  },
  ...over,
});

describe('applyDraftUpdate', () => {
  const additional = OrderType.additional_aligners;

  it('leaves omitted answers unchanged and clears the ones sent as null', () => {
    const next = applyDraftUpdate(additional, draft(), {
      answers: { upperInstructions: null, currentUpperAligner: 8 },
    });
    expect(next.answers).toMatchObject({
      reason: SupplementalRequestReason.finishing,
      upperInstructions: null,
      currentUpperAligner: 8,
    });
    expect(next.archTreatment).toBe(ArchTreatment.both);
  });

  it('ignores answers the kind does not ask', () => {
    const next = applyDraftUpdate(OrderType.replacement, draft(), {
      answers: {
        reason: SupplementalRequestReason.other,
        urgency: SupplementalUrgency.urgent,
      },
    });
    expect(next.answers.reason).toBe(SupplementalRequestReason.finishing);
    expect(next.answers.urgency).toBe(SupplementalUrgency.urgent);
  });

  it('clears the arch, and the passive-opposite question once both arches are treated', () => {
    const single = applyDraftUpdate(additional, draft(), {
      archTreatment: ArchTreatment.upper,
      answers: { passiveOppositeArch: true },
    });
    expect(single.answers.passiveOppositeArch).toBe(true);
    const both = applyDraftUpdate(additional, single, {
      archTreatment: ArchTreatment.both,
      answers: {},
    });
    expect(both.answers.passiveOppositeArch).toBeNull();
    expect(
      applyDraftUpdate(additional, draft(), {
        archTreatment: null,
        answers: {},
      }).archTreatment,
    ).toBeNull();
  });

  it('keeps the elastic cut-out answer only while an option needs it', () => {
    const asked = applyDraftUpdate(additional, draft(), {
      answers: {
        apOptions: [SupplementalApOption.elastics_simulation],
        elasticCutouts: true,
      },
    });
    expect(asked.answers.elasticCutouts).toBe(true);
    const dropped = applyDraftUpdate(additional, asked, {
      answers: { apOptions: [SupplementalApOption.posterior_ipr] },
    });
    expect(dropped.answers.elasticCutouts).toBeNull();
  });

  it('drops the teeth of an option the doctor deselects', () => {
    const next = applyDraftUpdate(additional, draft(), {
      answers: { movementRestriction: SupplementalTeethScope.none },
    });
    expect(next.details.teeth).toEqual([]);
  });

  it('drops the teeth and contacts of the arch a change of arch leaves', () => {
    const both = draft({
      details: {
        teeth: [
          { purpose: SupplementalToothPurpose.do_not_move, toothNumber: 13 },
          { purpose: SupplementalToothPurpose.do_not_move, toothNumber: 43 },
        ],
        contacts: [],
      },
    });
    const lower = applyDraftUpdate(additional, both, {
      archTreatment: ArchTreatment.lower,
      answers: {},
    });
    expect(lower.details.teeth).toEqual([
      { purpose: SupplementalToothPurpose.do_not_move, toothNumber: 43 },
    ]);
    // Teeth sent for the untreated arch are dropped too, silently.
    const sent = applyDraftUpdate(OrderType.transfer_template, draft(), {
      archTreatment: ArchTreatment.upper,
      answers: {},
      teeth: [
        { purpose: SupplementalToothPurpose.transfer_tray, toothNumber: 21 },
        { purpose: SupplementalToothPurpose.transfer_tray, toothNumber: 31 },
      ],
    });
    expect(sent.details.teeth).toEqual([
      { purpose: SupplementalToothPurpose.transfer_tray, toothNumber: 21 },
    ]);
  });

  it('replaces the teeth when sent, clears them on null, keeps them when omitted', () => {
    const replaced = applyDraftUpdate(additional, draft(), {
      answers: {},
      teeth: [
        { purpose: SupplementalToothPurpose.do_not_move, toothNumber: 23 },
      ],
    });
    expect(replaced.details.teeth).toEqual([
      { purpose: SupplementalToothPurpose.do_not_move, toothNumber: 23 },
    ]);
    expect(
      applyDraftUpdate(additional, draft(), { answers: {}, teeth: null })
        .details.teeth,
    ).toEqual([]);
    expect(
      applyDraftUpdate(additional, draft(), { answers: {} }).details.teeth,
    ).toEqual(draft().details.teeth);
  });
});

describe('draftChanges', () => {
  it('is empty when nothing changed (an idle autosave writes no audit row)', () => {
    expect(draftChanges(draft(), draft())).toEqual({});
  });

  it('records the arch, the answers, the teeth and the warranty day', () => {
    const before = draft();
    const after = draft({
      archTreatment: ArchTreatment.lower,
      answers: {
        ...before.answers,
        upperInstructions: null,
        warrantyDiscoveredAt: calendarDayToDate('2026-06-01'),
      },
      details: {
        teeth: [
          { purpose: SupplementalToothPurpose.do_not_move, toothNumber: 13 },
          { purpose: SupplementalToothPurpose.do_not_move, toothNumber: 23 },
        ],
        contacts: [],
      },
    });
    expect(draftChanges(before, after)).toEqual({
      archTreatment: { from: ArchTreatment.both, to: ArchTreatment.lower },
      upperInstructions: { from: 'Close the 13-14 space', to: null },
      warrantyDiscoveredAt: { from: null, to: '2026-06-01' },
      teeth: { from: 'do_not_move 13', to: 'do_not_move 13, 23' },
    });
  });
});

describe('draftUpdateFromDto', () => {
  it('sorts the defective aligners and clears them with null', () => {
    expect(
      draftUpdateFromDto({ defectiveAligners: [4, 1, 2] }).answers,
    ).toEqual({ defectiveAligners: [1, 2, 4] });
    expect(draftUpdateFromDto({ defectiveAligners: null }).answers).toEqual({
      defectiveAligners: [],
    });
  });

  it('turns the PUT body into a draft update', () => {
    const dto: UpdateSupplementalOrderDto = {
      archTreatment: ArchTreatment.upper,
      reasonDetails: null,
      warrantyDiscoveredAt: '2026-06-01',
      apOptions: null,
      contacts: [
        {
          purpose: SupplementalContactPurpose.performed_ipr,
          fromTooth: 21,
          toTooth: 11,
          amountMm: 0.25,
        },
      ],
    };
    expect(draftUpdateFromDto(dto)).toEqual({
      archTreatment: ArchTreatment.upper,
      answers: {
        reasonDetails: null,
        warrantyDiscoveredAt: new Date('2026-06-01T00:00:00.000Z'),
        apOptions: [],
      },
      teeth: undefined,
      contacts: [
        {
          purpose: SupplementalContactPurpose.performed_ipr,
          fromTooth: 11,
          toTooth: 21,
          amountMm: 0.25,
        },
      ],
    });
  });

  it('passes a cleared day and cleared teeth through as null', () => {
    expect(
      draftUpdateFromDto({ warrantyDiscoveredAt: null, teeth: null }),
    ).toMatchObject({ answers: { warrantyDiscoveredAt: null }, teeth: null });
  });

  it('round-trips a calendar day', () => {
    expect(dateToCalendarDay(calendarDayToDate('2026-02-28'))).toBe(
      '2026-02-28',
    );
  });
});
