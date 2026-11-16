import { Injectable } from '@nestjs/common';

/**
 * "Now" for the supplemental rules (coverage expiry, discovery day, review
 * and submission instants). Injected so a test pins the date instead of
 * depending on the day it runs.
 */
@Injectable()
export class SupplementalClock {
  now(): Date {
    return new Date();
  }
}
