import { Global, Module } from '@nestjs/common';
import { OrderAccessPolicy } from './order-access.policy';

/**
 * Cross-cutting authorization policies. Global so any feature service can
 * inject `OrderAccessPolicy` without wiring an import per module — the
 * whole point is that there is exactly one implementation of the rule.
 */
@Global()
@Module({
  providers: [OrderAccessPolicy],
  exports: [OrderAccessPolicy],
})
export class AccessModule {}
