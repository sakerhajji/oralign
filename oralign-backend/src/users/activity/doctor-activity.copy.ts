import type { LangText } from '../../common/i18n/lang';
import { formatActivityDate } from '../../mail/templates.account-activity';

/**
 * In-app copy of the inactivity notices (bell rows), FR / EN. The row is
 * stored already translated in the recipient's language by
 * NotificationsService. Links are dashboard paths, never absolute URLs,
 * and carry no personal data.
 */

export const NEW_ORDER_PATH = '/dashboard/orders/new';
export const DASHBOARD_PATH = '/dashboard';
export const SUPPORT_PATH = '/dashboard/support';
/** The users desk narrowed to dormant practitioners. */
export const DORMANT_DOCTORS_PATH =
  '/dashboard/users?role=dentist&activity=inactive';

export interface NoticeCopy {
  title: LangText;
  message: LangText;
  link: string;
}

export function warningNotice(input: {
  deadlineAt: string;
  daysLeft: number;
}): NoticeCopy {
  const fr = formatActivityDate(input.deadlineAt, 'fr');
  const en = formatActivityDate(input.deadlineAt, 'en');
  const days = Math.max(0, Math.round(input.daysLeft));
  return {
    title: {
      en: `Your account will become inactive on ${en}`,
      fr: `Votre compte deviendra inactif le ${fr}`,
    },
    message: {
      en: `No order has been submitted recently. Submit an order within ${days === 1 ? '1 day' : `${days} days`} to keep creating orders and stay listed in the practitioner directory.`,
      fr: `Aucune commande n’a été soumise récemment. Soumettez une commande d’ici ${days <= 1 ? `${days} jour` : `${days} jours`} pour continuer à commander et rester visible dans l’annuaire des praticiens.`,
    },
    link: NEW_ORDER_PATH,
  };
}

export function deactivatedNotice(): NoticeCopy {
  return {
    title: {
      en: 'Your account is now inactive',
      fr: 'Votre compte est désormais inactif',
    },
    message: {
      en: 'Creating and submitting orders is suspended and your practice is hidden from the public directory. Your treatments, payments and messages stay available. Contact Oralign to reactivate it.',
      fr: 'La création et la soumission de commandes sont suspendues et votre cabinet n’apparaît plus dans l’annuaire public. Vos traitements, paiements et messages restent accessibles. Contactez Oralign pour le réactiver.',
    },
    link: SUPPORT_PATH,
  };
}

export function reactivatedNotice(): NoticeCopy {
  return {
    title: {
      en: 'Your account is reactivated',
      fr: 'Votre compte est réactivé',
    },
    message: {
      en: 'You can create and submit orders again.',
      fr: 'Vous pouvez de nouveau créer et soumettre des commandes.',
    },
    link: NEW_ORDER_PATH,
  };
}

/** Admin bell row: the sweep turned a practitioner dormant. */
export function doctorDeactivatedAdminNotice(input: {
  fullName: string;
  anchorAt: string;
}): NoticeCopy {
  const fr = formatActivityDate(input.anchorAt, 'fr');
  const en = formatActivityDate(input.anchorAt, 'en');
  return {
    title: {
      en: 'Practitioner account turned inactive',
      fr: 'Compte praticien passé en inactif',
    },
    message: {
      en: `${input.fullName}: no order submitted since ${en}. Ordering is closed until an admin reactivates the account.`,
      fr: `${input.fullName} : aucune commande soumise depuis le ${fr}. Les commandes sont bloquées jusqu’à la réactivation du compte par un administrateur.`,
    },
    link: DORMANT_DOCTORS_PATH,
  };
}
