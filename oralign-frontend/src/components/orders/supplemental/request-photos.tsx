'use client';

import {
  ClinicalOrderFiles,
  hasPatientImageFiles,
} from '@/components/orders/order-file-upload';
import { OrderType, type OrderFile } from '@/lib/types';

export type RequestPhotoSection = 'aligner-evidence' | 'patient-images';

/**
 * The photo areas of a request. A refinement asks for intraoral views and a
 * warranty claim for the aligner itself. Other kinds ask for none, but
 * photos added before their form dropped that step stay visible.
 */
export function requestPhotoSections(
  kind: OrderType,
  files: readonly OrderFile[],
): RequestPhotoSection[] {
  const sections: RequestPhotoSection[] = [];
  if (kind === OrderType.WARRANTY) sections.push('aligner-evidence');
  if (kind === OrderType.ADDITIONAL_ALIGNERS || hasPatientImageFiles(files)) {
    sections.push('patient-images');
  }
  return sections;
}

export function RequestPhotos({
  orderId,
  sections,
  alignerNumbers,
  readOnly,
}: {
  orderId: string;
  sections: readonly RequestPhotoSection[];
  /** The defective aligners of a warranty claim. */
  alignerNumbers: readonly number[];
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <ClinicalOrderFiles
          key={section}
          orderId={orderId}
          readOnly={readOnly}
          section={section}
          alignerNumbers={alignerNumbers}
        />
      ))}
    </div>
  );
}
