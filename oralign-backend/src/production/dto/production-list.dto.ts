import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toOptionalTrimmed } from '../../common/dto/query-transforms';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SEARCH_MAX_LENGTH,
} from '../production.constants';

/**
 * Paging + search shared by the production lists. The repo convention is
 * `page` + `limit` (common/dto/response.dto.ts PaginatedResponse), so the
 * brief's "pageSize" is `limit` here.
 */
export class ProductionPageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: DEFAULT_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

export class ProductionSearchPageQueryDto extends ProductionPageQueryDto {
  @ApiPropertyOptional({
    maxLength: SEARCH_MAX_LENGTH,
    description:
      'Order code, patient or practitioner name (contains, case-insensitive). Trimmed; blank means no search.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalTrimmed(value))
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  search?: string;
}

/** The queue's two tabs. A string enum, never a boolean query param. */
export enum ProductionQueueTabParam {
  active = 'active',
  done = 'done',
}

/** GET production/queue */
export class ProductionQueueQueryDto extends ProductionSearchPageQueryDto {
  @ApiPropertyOptional({
    enum: ProductionQueueTabParam,
    default: ProductionQueueTabParam.active,
    description:
      'active = the production rule (D3); done = had production, no longer matches.',
  })
  @IsOptional()
  @IsEnum(ProductionQueueTabParam)
  tab?: ProductionQueueTabParam;
}

/** Which Tunis day "Ma journée" shows. */
export enum ProductionMyDayParam {
  today = 'today',
  yesterday = 'yesterday',
}

/** GET production/my-day */
export class ProductionMyDayQueryDto {
  @ApiPropertyOptional({
    enum: ProductionMyDayParam,
    default: ProductionMyDayParam.today,
  })
  @IsOptional()
  @IsEnum(ProductionMyDayParam)
  day?: ProductionMyDayParam;
}

/** Derived artefacts of an order file (same names as GET orders/:id/files/:fileId/download). */
export enum ProductionFileVariant {
  thumb = 'thumb',
  md = 'md',
  lg = 'lg',
  avif = 'avif',
  model = 'model',
}

/** GET production/orders/:orderId/files/:fileId/download */
export class ProductionFileDownloadQueryDto {
  @ApiPropertyOptional({
    enum: ProductionFileVariant,
    description:
      'Serve that variant inline (falls back to the original, inline, while it is not ready). Omitted: the original as an attachment.',
  })
  @IsOptional()
  @IsEnum(ProductionFileVariant)
  variant?: ProductionFileVariant;
}
