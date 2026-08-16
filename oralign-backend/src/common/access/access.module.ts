import { Global, Module } from '@nestjs/common';
import { OrderAccessPolicy } from './order-access.policy';
import { SocketAuth } from '../ws/socket-auth';

/**
 * Cross-cutting authorization: HTTP-side policies AND the Socket.IO
 * handshake authenticator. Global so any feature service can
 * inject `OrderAccessPolicy` without wiring an import per module — the
 * whole point is that there is exactly one implementation of the rule.
 */
@Global()
@Module({
  providers: [OrderAccessPolicy, SocketAuth],
  exports: [OrderAccessPolicy, SocketAuth],
})
export class AccessModule {}
