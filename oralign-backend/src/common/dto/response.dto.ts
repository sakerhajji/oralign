import { ApiProperty } from '@nestjs/swagger';

export class ApiResponse<T> {
  @ApiProperty({ description: 'HTTP status code' })
  public readonly statusCode: number;

  @ApiProperty({ description: 'A descriptive message about the response' })
  public readonly message: string;

  @ApiProperty({
    description: 'The response data payload',
    required: false,
  })
  public readonly data?: T;

  constructor(statusCode: number, message: string, data?: T) {
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }
}

export class PaginatedResponse<T> {
  @ApiProperty({
    isArray: true,
    description: 'Array of data for the current page',
  })
  public readonly data: T[];

  @ApiProperty({
    example: 100,
    description: 'Total number of items across all pages',
  })
  public readonly total: number;

  @ApiProperty({ example: 1, description: 'The current page number' })
  public readonly page: number;

  @ApiProperty({ example: 10, description: 'The number of items per page' })
  public readonly limit: number;

  @ApiProperty({ example: 10, description: 'The total number of pages' })
  public readonly totalPages: number;

  constructor(
    data: T[],
    total: number,
    page: number,
    limit: number,
    totalPages: number,
  ) {
    this.data = data;
    this.total = total;
    this.page = page;
    this.limit = limit;
    this.totalPages = totalPages;
  }
}
