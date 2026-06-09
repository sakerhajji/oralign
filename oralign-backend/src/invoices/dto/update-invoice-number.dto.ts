import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/**
 * Body for `PATCH /payments/:paymentId/invoice-number` — the admin's
 * override of the printed receipt number. Trimmed before validation so
 * a whitespace-only value fails the length check instead of persisting
 * blank.
 */
export class UpdateInvoiceNumberDto {
  @ApiProperty({
    example: 'FAC-000123',
    description: 'Printed invoice / receipt number (1–40 characters).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 40)
  invoiceNumber!: string;
}
