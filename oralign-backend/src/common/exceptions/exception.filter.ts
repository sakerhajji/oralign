import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppException } from './app.exception';

interface ErrorResponse {
  statusCode: number;
  message: string;
  errorCode?: string;
  timestamp: string;
}

/**
 * Map the Prisma "known request" errors that legitimately reach a client
 * onto proper HTTP semantics. Without this a duplicate email (P2002) or a
 * concurrent delete (P2025) surfaced as an opaque 500 that looked like a
 * crash in monitoring and told the user nothing. Everything not listed
 * here still falls through to the opaque 500 branch (never leak the raw
 * message - it can carry table/column names).
 */
function mapPrismaError(
  err: Prisma.PrismaClientKnownRequestError,
): { status: number; message: string; errorCode: string } | null {
  switch (err.code) {
    case 'P2002': {
      const target = (err.meta?.target as string[] | string | undefined) ?? [];
      const fields = Array.isArray(target) ? target.join(', ') : String(target);
      return {
        status: HttpStatus.CONFLICT,
        message: fields
          ? `A record with the same ${fields} already exists.`
          : 'A record with the same unique value already exists.',
        errorCode: 'UNIQUE_CONSTRAINT',
      };
    }
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'The requested record no longer exists.',
        errorCode: 'RECORD_NOT_FOUND',
      };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        message: 'This record is referenced by other data and cannot be changed.',
        errorCode: 'FOREIGN_KEY_CONSTRAINT',
      };
    default:
      return null;
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let errorResponse: ErrorResponse;

    if (exception instanceof AppException) {
      errorResponse = {
        statusCode: exception.statusCode,
        message: exception.message,
        errorCode: exception.errorCode,
        timestamp: new Date().toISOString(),
      };
      response.status(exception.statusCode).json(errorResponse);
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      errorResponse = {
        statusCode: status,
        message:
          typeof exceptionResponse === 'object' &&
          'message' in (exceptionResponse as Record<string, unknown>)
            ? (exceptionResponse as Record<string, string>).message
            : exception.message || 'Http Exception',
        timestamp: new Date().toISOString(),
      };
      response.status(status).json(errorResponse);
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      mapPrismaError(exception)
    ) {
      const mapped = mapPrismaError(exception)!;
      errorResponse = {
        statusCode: mapped.status,
        message: mapped.message,
        errorCode: mapped.errorCode,
        timestamp: new Date().toISOString(),
      };
      response.status(mapped.status).json(errorResponse);
    } else if (exception instanceof Error) {
      // SECURITY (audit L-4): a raw internal Error message can leak DB /
      // stack / dependency details. Log the real error server-side and
      // return an opaque message to the client. Intentional user-facing
      // errors go through AppException / HttpException above, so this
      // branch is only genuinely-unexpected failures.
      const req = ctx.getRequest<Request>();
      this.logger.error(
        `Unhandled error on ${req?.method} ${req?.url}: ${exception.message}`,
        exception.stack,
      );
      errorResponse = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        timestamp: new Date().toISOString(),
      };
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(errorResponse);
    } else {
      this.logger.error(`Unknown non-Error exception thrown`, exception as never);
      errorResponse = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        timestamp: new Date().toISOString(),
      };
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(errorResponse);
    }
  }
}
