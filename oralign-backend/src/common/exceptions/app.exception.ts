/**
 * Extra machine-readable members of an error body, sent next to
 * statusCode / message / errorCode (e.g. `{ warnings: [...] }` on a 409 the
 * client must confirm). Keys the envelope already uses are never
 * overwritten (see AllExceptionsFilter). Never put secrets or internal
 * state here: it reaches the client as is.
 */
export type ErrorDetails = Readonly<Record<string, unknown>>;

export class AppException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly message: string,
    public readonly errorCode?: string,
    public readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = 'AppException';
  }
}

export class BadRequestException extends AppException {
  constructor(message: string, errorCode?: string, details?: ErrorDetails) {
    super(400, message, errorCode, details);
    this.name = 'BadRequestException';
  }
}

export class UnauthorizedException extends AppException {
  constructor(
    message: string = 'Unauthorized',
    errorCode?: string,
    details?: ErrorDetails,
  ) {
    super(401, message, errorCode, details);
    this.name = 'UnauthorizedException';
  }
}

export class ForbiddenException extends AppException {
  constructor(
    message: string = 'Forbidden',
    errorCode?: string,
    details?: ErrorDetails,
  ) {
    super(403, message, errorCode, details);
    this.name = 'ForbiddenException';
  }
}

export class NotFoundException extends AppException {
  constructor(message: string = 'Not found', errorCode?: string) {
    super(404, message, errorCode);
    this.name = 'NotFoundException';
  }
}

export class ConflictException extends AppException {
  constructor(message: string, errorCode?: string, details?: ErrorDetails) {
    super(409, message, errorCode, details);
    this.name = 'ConflictException';
  }
}

export class GoneException extends AppException {
  constructor(message: string = 'Gone', errorCode?: string) {
    super(410, message, errorCode);
    this.name = 'GoneException';
  }
}

export class InternalServerErrorException extends AppException {
  constructor(message: string = 'Internal server error', errorCode?: string) {
    super(500, message, errorCode);
    this.name = 'InternalServerErrorException';
  }
}
