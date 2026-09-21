import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { env } from '../../common/config/env';
import {
  ClicToPayError,
  ClicToPayLanguage,
  ClicToPayPageView,
  ClicToPayRegistration,
  ClicToPayStatus,
} from './clictopay.types';

type JsonObject = Record<string, unknown>;

@Injectable()
export class ClicToPayClient {
  private readonly logger = new Logger(ClicToPayClient.name);

  static amountToMillimes(amount: Prisma.Decimal | string | number): number {
    const decimal = new Prisma.Decimal(amount);
    if (!decimal.isPositive() || decimal.decimalPlaces() > 3) {
      throw new ClicToPayError(
        'provider',
        'PAYMENT_AMOUNT_INVALID',
        'The server-calculated payment amount is invalid.',
      );
    }
    const millimes = decimal.mul(1000);
    if (!millimes.isInteger() || millimes.gt(Number.MAX_SAFE_INTEGER)) {
      throw new ClicToPayError(
        'provider',
        'PAYMENT_AMOUNT_INVALID',
        'The server-calculated payment amount cannot be represented safely.',
      );
    }
    return millimes.toNumber();
  }

  async register(input: {
    orderNumber: string;
    amount: number;
    returnUrl: string;
    failUrl: string;
    language?: ClicToPayLanguage;
    pageView?: ClicToPayPageView;
  }): Promise<ClicToPayRegistration> {
    const body = this.credentials();
    body.set('orderNumber', input.orderNumber);
    body.set('amount', String(input.amount));
    body.set('currency', env.clicToPay.currency);
    body.set('returnUrl', input.returnUrl);
    body.set('failUrl', input.failUrl);
    if (input.language) body.set('language', input.language);
    if (input.pageView) body.set('pageView', input.pageView);

    // Registration is intentionally never retried: the first request may
    // have reached ClicToPay even if its response was lost. Retrying could
    // create ambiguity or duplicate-order errors.
    const data = await this.post('register.do', body, false);
    this.throwProviderError(data, 'PAYMENT_REGISTRATION_REJECTED');
    const orderId = this.stringField(data, 'orderId');
    const formUrl = this.stringField(data, 'formUrl');
    if (!orderId || !formUrl || !this.isAbsoluteHttpUrl(formUrl)) {
      throw new ClicToPayError(
        'ambiguous',
        'PAYMENT_PROVIDER_RESPONSE_INVALID',
        'The payment provider returned an incomplete registration response.',
      );
    }
    return { orderId, formUrl };
  }

  async getStatus(input: {
    orderId?: string;
    orderNumber?: string;
  }): Promise<ClicToPayStatus> {
    if (!input.orderId && !input.orderNumber) {
      throw new ClicToPayError(
        'provider',
        'PAYMENT_REFERENCE_MISSING',
        'No provider payment reference is available.',
      );
    }
    const body = this.credentials();
    if (input.orderId) body.set('orderId', input.orderId);
    else body.set('orderNumber', input.orderNumber!);

    const data = await this.post('getOrderStatusExtended.do', body, true);
    this.throwProviderError(data, 'PAYMENT_STATUS_UNAVAILABLE');
    const orderStatus = this.numberField(data, 'orderStatus');
    if (!Number.isInteger(orderStatus)) {
      throw new ClicToPayError(
        'ambiguous',
        'PAYMENT_PROVIDER_RESPONSE_INVALID',
        'The payment provider returned an invalid status response.',
      );
    }
    return {
      orderStatus,
      orderNumber: this.stringField(data, 'orderNumber'),
      amount: this.optionalNumberField(data, 'amount'),
      currency: this.stringField(data, 'currency'),
      actionCode: this.optionalNumberField(data, 'actionCode'),
    };
  }

  private credentials(): URLSearchParams {
    if (!env.clicToPay.configured) {
      throw new ClicToPayError(
        'configuration',
        'PAYMENT_PROVIDER_NOT_CONFIGURED',
        'Card payments are temporarily unavailable.',
      );
    }
    return new URLSearchParams({
      userName: env.clicToPay.username!,
      password: env.clicToPay.password!,
    });
  }

  private async post(
    path: string,
    body: URLSearchParams,
    mayRetry: boolean,
  ): Promise<JsonObject> {
    const attempts = mayRetry ? 3 : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.clicToPay.timeoutMs);
      try {
        const response = await fetch(this.endpoint(path), {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status >= 500) {
            throw new Error(`Provider HTTP ${response.status}`);
          }
          throw new ClicToPayError(
            'provider',
            'PAYMENT_PROVIDER_REJECTED_REQUEST',
            'The payment provider rejected the request.',
            String(response.status),
          );
        }
        const json: unknown = await response.json();
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
          throw new ClicToPayError(
            'ambiguous',
            'PAYMENT_PROVIDER_RESPONSE_INVALID',
            'The payment provider returned an invalid response.',
          );
        }
        return json as JsonObject;
      } catch (error) {
        if (error instanceof ClicToPayError && error.kind === 'provider') {
          throw error;
        }
        lastError = error;
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 250));
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    this.logger.warn(`ClicToPay ${path} request ended without a definitive response.`);
    throw new ClicToPayError(
      'ambiguous',
      'PAYMENT_PROVIDER_UNREACHABLE',
      'The payment provider could not be reached. The payment status is unknown.',
      lastError instanceof Error ? lastError.name : undefined,
    );
  }

  private endpoint(path: string): string {
    return `${env.clicToPay.apiUrl!.replace(/\/+$/, '')}/${path}`;
  }

  private throwProviderError(data: JsonObject, safeCode: string): void {
    const code = this.stringField(data, 'errorCode');
    if (!code || code === '0') return;
    throw new ClicToPayError(
      'provider',
      safeCode,
      this.providerErrorMessage(code),
      code,
    );
  }

  private providerErrorMessage(code: string): string {
    switch (code) {
      case '1':
        return 'The payment reference is invalid or already registered.';
      case '3':
        return 'The configured payment currency is not accepted.';
      case '4':
        return 'A required payment field is missing.';
      case '5':
        return 'The payment provider credentials or access are invalid.';
      case '6':
        return 'The payment was not found at the provider.';
      case '7':
        return 'The payment provider reported an internal error.';
      default:
        return 'The payment provider rejected the request.';
    }
  }

  private stringField(data: JsonObject, key: string): string | undefined {
    const value = data[key];
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const normalised = String(value).trim();
    return normalised || undefined;
  }

  private numberField(data: JsonObject, key: string): number {
    const value = data[key];
    return typeof value === 'number' ? value : Number(value);
  }

  private optionalNumberField(data: JsonObject, key: string): number | undefined {
    if (data[key] === undefined || data[key] === null || data[key] === '') return undefined;
    const value = this.numberField(data, key);
    return Number.isFinite(value) ? value : undefined;
  }

  private isAbsoluteHttpUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }
}
