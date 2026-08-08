import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from './app.exception';

interface ErrorResponse {
  statusCode: number;
  message: string;
  errorCode?: string;
  timestamp: string;
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
