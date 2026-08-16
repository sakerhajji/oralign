import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { requiredSecret } from '../../common/config/required-secret';
import { isUserRole } from '../../common/access/caller';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requiredSecret('JWT_SECRET'),
    });
  }

  /**
   * The signature/expiry are already verified by passport-jwt. This is
   * the ONE place the raw claims become a typed principal: a token whose
   * `role` is not a known UserRole is rejected here, so downstream code
   * can rely on `user.role: UserRole` without casting.
   */
  validate(payload: Omit<JwtPayload, 'role'> & { role: unknown }): JwtPayload {
    if (!isUserRole(payload.role)) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return { ...payload, role: payload.role };
  }
}
