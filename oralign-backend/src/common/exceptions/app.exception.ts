export class AppException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly message: string,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'AppException';
  }
}

export class BadRequestException extends AppException {
  constructor(message: string, errorCode?: string) {
    super(400, message, errorCode);
    this.name = 'BadRequestException';
  }
}

export class UnauthorizedException extends AppException {
  constructor(message: string = 'Unauthorized', errorCode?: string) {
    super(401, message, errorCode);
    this.name = 'UnauthorizedException';
  }
}

export class ForbiddenException extends AppException {
  constructor(message: string = 'Forbidden', errorCode?: string) {
    super(403, message, errorCode);
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
  constructor(message: string, errorCode?: string) {
    super(409, message, errorCode);
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
