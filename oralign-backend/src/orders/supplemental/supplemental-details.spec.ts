import {
  ArchTreatment,
  OrderType,
  SupplementalAttachmentPlan,
  SupplementalContactPurpose as Contact,
  SupplementalCutoutPlan,
  SupplementalExistingAttachments,
  SupplementalIprPlan,
  SupplementalPreviousIpr,
  SupplementalResidualSpaces,
  SupplementalTeethScope,
  SupplementalToothPurpose as Tooth,
} from '@prisma/client';
import {
  archOfTooth,
  areAdjacentTeeth,
  describeContacts,
  describeTeeth,
  detailInputErrors,
  detailProblems,
  isOnTreatedArch,
  keepOwnedDetails,
  keepTreatedArchDetails,
  missingDetailProblems,
  normaliseContact,
  normaliseDetails,
  outOfArchDetailProblems,
  type DetailOwnerAnswers,
} from './supplemental-details';
import type {
  SupplementalOrderType,
  ToothContact,
  ToothSelection,
} from './supplemental.types';

/** Every owner selected: every detail is asked. */
const ALL_SELECTED: DetailOwnerAnswers = {
  movementRestriction: SupplementalTeethScope.selected_teeth,
  attachmentPolicy: SupplementalAttachmentPlan.avoid_selected_teeth,
  existingAttachmentPolicy: SupplementalExistingAttachments.remove_selected,
  iprPolicy: SupplementalIprPlan.avoid_selected_teeth,
  previousIpr: SupplementalPreviousIpr.different,
  precisionCutPolicy: SupplementalCutoutPlan.selected_teeth,
  residualSpacePolicy: SupplementalResidualSpaces.close_specified,
};

/** Every owner answered with an option that asks for nothing. */
const NONE_SELECTED: DetailOwnerAnswers = {
  movementRestriction: SupplementalTeethScope.none,
  attachmentPolicy: SupplementalAttachmentPlan.as_needed,
  existingAttachmentPolicy: SupplementalExistingAttachments.keep_all,
  iprPolicy: SupplementalIprPlan.as_needed,
  previousIpr: SupplementalPreviousIpr.as_prescribed,
  precisionCutPolicy: SupplementalCutoutPlan.none,
  residualSpacePolicy: SupplementalResidualSpaces.none,
};

const tooth = (purpose: Tooth, toothNumber: number): ToothSelection => ({
  purpose,
  toothNumber,
});
const contact = (
  purpose: Contact,
  fromTooth: number,
  toTooth: number,
  amountMm = 0.2,
): ToothContact => ({ purpose, fromTooth, toTooth, amountMm });

describe('areAdjacentTeeth', () => {
  it.each([
    [11, 12, true],
    [12, 11, true],
    [17, 18, true],
    [11, 21, true],
    [21, 11, true],
    [31, 41, true],
    [41, 42, true],
    [11, 13, false],
    [18, 21, false],
    [21, 31, false],
    [11, 41, false],
    [28, 38, false],
    [19, 18, false],
    [10, 11, false],
  ])('%i–%i → %s', (a, b, expected) => {
    expect(areAdjacentTeeth(a, b)).toBe(expected);
  });
});

describe('normaliseContact', () => {
  it('stores the lower tooth first', () => {
    expect(normaliseContact(contact(Contact.performed_ipr, 21, 11))).toEqual(
      contact(Contact.performed_ipr, 11, 21),
    );
    const ordered = contact(Contact.performed_ipr, 11, 12);
    expect(normaliseContact(ordered)).toBe(ordered);
  });
});

describe('detailInputErrors', () => {
  it('accepts the teeth and contacts a refinement asks for', () => {
    expect(
      detailInputErrors(OrderType.additional_aligners, {
        teeth: [tooth(Tooth.do_not_move, 13), tooth(Tooth.no_ipr, 13)],
        contacts: [
          contact(Contact.performed_ipr, 11, 21, 2),
          contact(Contact.residual_space, 13, 14, 9.99),
        ],
      }),
    ).toEqual([]);
  });

  it.each<[string, SupplementalOrderType, ToothSelection[], ToothContact[]]>([
    [
      'a purpose the kind does not ask',
      OrderType.replacement,
      [tooth(Tooth.do_not_move, 11)],
      [],
    ],
    [
      'a tray tooth on a refinement',
      OrderType.additional_aligners,
      [tooth(Tooth.transfer_tray, 11)],
      [],
    ],
    [
      'a contact on a transfer template',
      OrderType.transfer_template,
      [],
      [contact(Contact.performed_ipr, 11, 12)],
    ],
    [
      'a tooth outside the permanent dentition',
      OrderType.transfer_template,
      [tooth(Tooth.transfer_tray, 19)],
      [],
    ],
    [
      'the same tooth twice for one purpose',
      OrderType.additional_aligners,
      [tooth(Tooth.cutout, 13), tooth(Tooth.cutout, 13)],
      [],
    ],
    [
      'teeth that do not touch',
      OrderType.additional_aligners,
      [],
      [contact(Contact.performed_ipr, 11, 13)],
    ],
    [
      'the same contact twice',
      OrderType.additional_aligners,
      [],
      [
        contact(Contact.performed_ipr, 11, 12),
        contact(Contact.performed_ipr, 11, 12),
      ],
    ],
    [
      'performed IPR above 2 mm',
      OrderType.additional_aligners,
      [],
      [contact(Contact.performed_ipr, 11, 12, 2.01)],
    ],
    [
      'a residual space below 0.05 mm',
      OrderType.additional_aligners,
      [],
      [contact(Contact.residual_space, 11, 12, 0.04)],
    ],
  ])('refuses %s', (_, type, teeth, contacts) => {
    expect(detailInputErrors(type, { teeth, contacts }).length).toBeGreaterThan(
      0,
    );
  });
});

describe('keepOwnedDetails (§1.4 option → detail table)', () => {
  const everyDetail = {
    teeth: Object.values(Tooth).map((purpose) => tooth(purpose, 11)),
    contacts: Object.values(Contact).map((purpose) => contact(purpose, 11, 12)),
  };

  it('keeps every detail whose owning option is selected', () => {
    expect(keepOwnedDetails(ALL_SELECTED, everyDetail)).toEqual(everyDetail);
  });

  it('drops every owned detail when no owner asks for it; tray teeth are always kept', () => {
    expect(keepOwnedDetails(NONE_SELECTED, everyDetail)).toEqual({
      teeth: [tooth(Tooth.transfer_tray, 11)],
      contacts: [],
    });
  });

  it.each<[keyof DetailOwnerAnswers, Tooth | Contact]>([
    ['movementRestriction', Tooth.do_not_move],
    ['attachmentPolicy', Tooth.no_attachment],
    ['existingAttachmentPolicy', Tooth.remove_attachment],
    ['iprPolicy', Tooth.no_ipr],
    ['precisionCutPolicy', Tooth.cutout],
    ['previousIpr', Contact.performed_ipr],
    ['residualSpacePolicy', Contact.residual_space],
  ])('%s owns the %s details', (field, purpose) => {
    const kept = keepOwnedDetails(
      { ...ALL_SELECTED, [field]: NONE_SELECTED[field] },
      everyDetail,
    );
    const purposes = [...kept.teeth, ...kept.contacts].map((d) => d.purpose);
    expect(purposes).not.toContain(purpose);
    expect(purposes).toHaveLength(
      everyDetail.teeth.length + everyDetail.contacts.length - 1,
    );
  });
});

describe('missingDetailProblems', () => {
  it('flags every selected owner without a detail', () => {
    expect(
      missingDetailProblems(OrderType.additional_aligners, ALL_SELECTED, {
        teeth: [tooth(Tooth.do_not_move, 11)],
        contacts: [contact(Contact.residual_space, 11, 12)],
      }),
    ).toEqual([
      'teeth.no_attachment:required',
      'teeth.remove_attachment:required',
      'teeth.no_ipr:required',
      'teeth.cutout:required',
      'contacts.performed_ipr:required',
    ]);
  });

  it('asks nothing when no owner is selected', () => {
    expect(
      missingDetailProblems(OrderType.additional_aligners, NONE_SELECTED, {
        teeth: [],
        contacts: [],
      }),
    ).toEqual([]);
  });

  it('always asks a transfer template for its tray teeth', () => {
    expect(
      missingDetailProblems(OrderType.transfer_template, NONE_SELECTED, {
        teeth: [],
        contacts: [],
      }),
    ).toEqual(['teeth.transfer_tray:required']);
  });
});

describe('treated arches (contract: upper 11-28, lower 31-48, both: all)', () => {
  const mixed = {
    teeth: [
      tooth(Tooth.cutout, 13),
      tooth(Tooth.cutout, 28),
      tooth(Tooth.cutout, 31),
      tooth(Tooth.no_ipr, 46),
    ],
    contacts: [
      contact(Contact.residual_space, 11, 21),
      contact(Contact.residual_space, 31, 41),
      contact(Contact.performed_ipr, 44, 45),
    ],
  };
  const upperOnly = {
    teeth: [tooth(Tooth.cutout, 13), tooth(Tooth.cutout, 28)],
    contacts: [contact(Contact.residual_space, 11, 21)],
  };

  it.each([
    [11, ArchTreatment.upper],
    [28, ArchTreatment.upper],
    [31, ArchTreatment.lower],
    [48, ArchTreatment.lower],
  ])('tooth %i is on the %s arch', (number, arch) => {
    expect(archOfTooth(number)).toBe(arch);
  });

  it('both arches, or an arch not chosen yet, rule nothing out', () => {
    for (const arch of [ArchTreatment.both, null]) {
      expect(isOnTreatedArch(36, arch)).toBe(true);
      expect(keepTreatedArchDetails(arch, mixed)).toEqual(mixed);
      expect(outOfArchDetailProblems(arch, mixed)).toEqual([]);
    }
  });

  it('one arch keeps its own teeth and contacts only', () => {
    expect(keepTreatedArchDetails(ArchTreatment.upper, mixed)).toEqual(
      upperOnly,
    );
    expect(keepTreatedArchDetails(ArchTreatment.lower, mixed)).toEqual({
      teeth: [tooth(Tooth.cutout, 31), tooth(Tooth.no_ipr, 46)],
      contacts: [
        contact(Contact.residual_space, 31, 41),
        contact(Contact.performed_ipr, 44, 45),
      ],
    });
  });

  it('a save keeps owned details on the treated arch only', () => {
    expect(
      normaliseDetails(
        ArchTreatment.upper,
        { ...ALL_SELECTED, previousIpr: NONE_SELECTED.previousIpr },
        mixed,
      ),
    ).toEqual(upperOnly);
  });

  it('flags each purpose holding an off-arch detail once, at submission', () => {
    expect(outOfArchDetailProblems(ArchTreatment.upper, mixed)).toEqual([
      'teeth.cutout:invalid',
      'teeth.no_ipr:invalid',
      'contacts.residual_space:invalid',
      'contacts.performed_ipr:invalid',
    ]);
  });

  it('detailProblems lists the missing details, then the off-arch ones', () => {
    expect(
      detailProblems(
        OrderType.transfer_template,
        ArchTreatment.lower,
        NONE_SELECTED,
        { teeth: [tooth(Tooth.transfer_tray, 21)], contacts: [] },
      ),
    ).toEqual(['teeth.transfer_tray:invalid']);
  });
});

describe('describeTeeth / describeContacts', () => {
  it('renders a stable line whatever the input order', () => {
    expect(
      describeTeeth([
        tooth(Tooth.no_ipr, 23),
        tooth(Tooth.cutout, 13),
        tooth(Tooth.no_ipr, 13),
      ]),
    ).toBe('cutout 13; no_ipr 13, 23');
    expect(
      describeContacts([
        contact(Contact.residual_space, 13, 14, 1.5),
        contact(Contact.performed_ipr, 11, 21, 0.2),
      ]),
    ).toBe('performed_ipr 11-21 0.2 mm; residual_space 13-14 1.5 mm');
  });
});
