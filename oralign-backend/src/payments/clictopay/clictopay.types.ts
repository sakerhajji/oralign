export type ClicToPayLanguage = 'fr' | 'en' | 'ar';
export type ClicToPayPageView = 'DESKTOP' | 'MOBILE';

export interface ClicToPayRegistration {
  orderId: string;
  formUrl: string;
}

export interface ClicToPayStatus {
  orderStatus: number;
  orderNumber?: string;
  amount?: number;
  currency?: string;
  actionCode?: number;
}

export type ClicToPayErrorKind = 'configuration' | 'provider' | 'ambiguous';

export class ClicToPayError extends Error {
  constructor(
    public readonly kind: ClicToPayErrorKind,
    public readonly safeCode: string,
    message: string,
    public readonly providerCode?: string,
  ) {
    super(message);
    this.name = 'ClicToPayError';
  }
}
