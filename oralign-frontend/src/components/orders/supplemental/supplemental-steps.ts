import type { ComponentType } from 'react';
import {
  Camera,
  ClipboardCheck,
  ClipboardList,
  Grid3x3,
  Layers,
  Magnet,
  MoveHorizontal,
  ScanLine,
  Scissors,
  ShieldAlert,
  Stamp,
  type LucideIcon,
} from 'lucide-react';
import { OrderType, type SupplementalKind } from '@/lib/types';
import { ArchesStep } from './steps/additional/arches-step';
import { AttachmentsStep } from './steps/additional/attachments-step';
import { FinishingStep } from './steps/additional/finishing-step';
import { MovementStep } from './steps/additional/movement-step';
import { ScansStep } from './steps/additional/scans-step';
import { SituationStep } from './steps/additional/situation-step';
import { PhotosStep } from './steps/photos-step';
import { ReplacementStep } from './steps/replacement-step';
import { ReviewStep } from './steps/review-step';
import type { StepProps } from './steps/step-props';
import { TransferTeethStep, TransferTemplateStep } from './steps/transfer-template-step';
import { WarrantyStep } from './steps/warranty-step';
import type { StepKey } from './supplemental-validation';

export interface StepDefinition {
  key: StepKey;
  icon: LucideIcon;
  Component: ComponentType<StepProps>;
}

/** Dictionary key of a step's title / heading / description. */
export function stepCopyKey(step: StepKey, part: 'title' | 'heading' | 'description'): string {
  return `supplemental.steps.${step}.${part}`;
}

const REVIEW: StepDefinition = { key: 'review', icon: ClipboardCheck, Component: ReviewStep };

/** Wizard steps per kind, in order. Validation is keyed by `key`. */
export const KIND_STEPS: Record<SupplementalKind, readonly StepDefinition[]> = {
  [OrderType.ADDITIONAL_ALIGNERS]: [
    { key: 'situation', icon: ClipboardList, Component: SituationStep },
    { key: 'arches', icon: Layers, Component: ArchesStep },
    { key: 'movement', icon: MoveHorizontal, Component: MovementStep },
    { key: 'attachments', icon: Magnet, Component: AttachmentsStep },
    { key: 'finishing', icon: Scissors, Component: FinishingStep },
    { key: 'scans', icon: ScanLine, Component: ScansStep },
    { key: 'photos', icon: Camera, Component: PhotosStep },
    REVIEW,
  ],
  [OrderType.REPLACEMENT]: [
    { key: 'replacementDetails', icon: ClipboardList, Component: ReplacementStep },
    { key: 'optionalPhotos', icon: Camera, Component: PhotosStep },
    REVIEW,
  ],
  [OrderType.TRANSFER_TEMPLATE]: [
    { key: 'transferDetails', icon: Stamp, Component: TransferTemplateStep },
    { key: 'transferTeeth', icon: Grid3x3, Component: TransferTeethStep },
    REVIEW,
  ],
  [OrderType.WARRANTY]: [
    { key: 'warrantyDetails', icon: ShieldAlert, Component: WarrantyStep },
    { key: 'evidencePhotos', icon: Camera, Component: PhotosStep },
    REVIEW,
  ],
};
