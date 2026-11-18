import { ArchTreatment, PatientStage } from '@prisma/client';
import { warrantyReplacementDefaults } from './supplemental-defaults';

const defaultsFor = (defectiveAligners: number[]) =>
  warrantyReplacementDefaults(
    {
      orderCode: 'CASE-001-WAR-01',
      archTreatment: ArchTreatment.upper,
      defectiveAligners,
    },
    { patientStage: PatientStage.initial },
  ).answers;

describe('warrantyReplacementDefaults', () => {
  it('replaces the one defective aligner', () => {
    expect(defaultsFor([5])).toMatchObject({
      replacementFromAligner: 5,
      replacementToAligner: 5,
      reasonDetails: 'Garantie refusée CASE-001-WAR-01',
    });
  });

  it('turns consecutive aligners into their range', () => {
    expect(defaultsFor([4, 5, 6])).toMatchObject({
      replacementFromAligner: 4,
      replacementToAligner: 6,
      reasonDetails: 'Garantie refusée CASE-001-WAR-01 (aligneurs 4, 5, 6)',
    });
  });

  it('leaves the range empty when a range would add an aligner not claimed', () => {
    expect(defaultsFor([1, 2, 4])).toMatchObject({
      replacementFromAligner: null,
      replacementToAligner: null,
      reasonDetails: 'Garantie refusée CASE-001-WAR-01 (aligneurs 1, 2, 4)',
    });
  });
});
