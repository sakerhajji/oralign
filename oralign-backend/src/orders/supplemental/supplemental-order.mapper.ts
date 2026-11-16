import type { Caller } from '../../common/access/caller';
import { mapOrderToDto } from '../services/order.mapper';
import { dateToCalendarDay, type DraftState } from './supplemental-draft';
import { permissionsFor } from './supplemental-permissions';
import type { LoadedChild } from './supplemental-order.repository';
import type {
  SupplementalOrderView,
  SupplementalRequestDto,
  ToothContact,
} from './supplemental.types';

/** Response mapping of the supplemental flows. Pure. */

/** A converted replacement that was archived no longer counts. */
export function liveConversionId(child: LoadedChild): string | null {
  const replacement = child.supplementalRequest.convertedReplacementOrder;
  return replacement && !replacement.deletedAt ? replacement.id : null;
}

export function contactsOf(child: LoadedChild): ToothContact[] {
  return child.supplementalRequest.contacts.map((contact) => ({
    ...contact,
    amountMm: contact.amountMm.toNumber(),
  }));
}

/** The stored draft as the pure draft rules read it. */
export function draftStateOf(child: LoadedChild): DraftState {
  const request = child.supplementalRequest;
  return {
    archTreatment: child.archTreatment,
    answers: {
      reason: request.reason,
      reasonDetails: request.reasonDetails,
      currentUpperAligner: request.currentUpperAligner,
      currentLowerAligner: request.currentLowerAligner,
      passiveOppositeArch: request.passiveOppositeArch,
      newUpperScan: request.newUpperScan,
      newLowerScan: request.newLowerScan,
      clinicalObjective: request.clinicalObjective,
      movementRestriction: request.movementRestriction,
      apRelationshipRight: request.apRelationshipRight,
      apRelationshipLeft: request.apRelationshipLeft,
      apOptions: request.apOptions,
      elasticCutouts: request.elasticCutouts,
      attachmentPolicy: request.attachmentPolicy,
      existingAttachmentPolicy: request.existingAttachmentPolicy,
      iprPolicy: request.iprPolicy,
      previousIpr: request.previousIpr,
      precisionCutPolicy: request.precisionCutPolicy,
      residualSpacePolicy: request.residualSpacePolicy,
      upperInstructions: request.upperInstructions,
      lowerInstructions: request.lowerInstructions,
      impressionMethod: request.impressionMethod,
      replacementFromAligner: request.replacementFromAligner,
      replacementToAligner: request.replacementToAligner,
      quantity: request.quantity,
      replacementReason: request.replacementReason,
      urgency: request.urgency,
      sourceTreatmentPlanId: request.sourceTreatmentPlanId,
      transferPurpose: request.transferPurpose,
      transferNotes: request.transferNotes,
      warrantyDefectCategory: request.warrantyDefectCategory,
      warrantyDiscoveredAt: request.warrantyDiscoveredAt,
      warrantyLotReference: request.warrantyLotReference,
      warrantyComments: request.warrantyComments,
    },
    details: { teeth: request.teeth, contacts: contactsOf(child) },
  };
}

function toRequestDto(child: LoadedChild): SupplementalRequestDto {
  // The include omits idempotencyKey: what is left are the columns plus
  // the three relations, which are re-shaped below.
  const {
    teeth,
    contacts: _contacts,
    convertedReplacementOrder: _replacement,
    warrantyDiscoveredAt,
    ...columns
  } = child.supplementalRequest;
  return {
    ...columns,
    convertedReplacementOrderId: liveConversionId(child),
    warrantyDiscoveredAt: warrantyDiscoveredAt
      ? dateToCalendarDay(warrantyDiscoveredAt)
      : null,
    teeth,
    contacts: contactsOf(child),
  };
}

export function toSupplementalView(
  child: LoadedChild,
  caller: Caller,
): SupplementalOrderView {
  const request = child.supplementalRequest;
  const parent = child.parentOrder;
  return {
    order: mapOrderToDto(child),
    request: toRequestDto(child),
    parentOrder: {
      id: parent.id,
      orderCode: parent.orderCode,
      status: parent.status,
      orderType: parent.orderType,
      archTreatment: parent.archTreatment,
      coverageStartedAt: parent.coverageStartedAt,
      coverageExpiresAt: parent.coverageExpiresAt,
    },
    permissions: permissionsFor(
      {
        doctorId: child.doctorId,
        orderType: child.orderType,
        status: child.status,
        request,
        hasLiveConversion: liveConversionId(child) !== null,
      },
      caller,
    ),
  };
}
