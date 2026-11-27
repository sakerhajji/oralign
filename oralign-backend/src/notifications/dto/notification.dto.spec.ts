import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NotificationFilterDto } from './notification.dto';

/** The global ValidationPipe's transform (enableImplicitConversion on). */
const parse = (query: Record<string, unknown>) =>
  plainToInstance(NotificationFilterDto, query, {
    enableImplicitConversion: true,
  });

describe('NotificationFilterDto.unreadOnly', () => {
  it('reads "false" as false (implicit conversion used to make it true)', async () => {
    const dto = parse({ unreadOnly: 'false' });
    expect(dto.unreadOnly).toBe(false);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('reads "true" as true and an absent flag as not set', () => {
    expect(parse({ unreadOnly: 'true' }).unreadOnly).toBe(true);
    expect(parse({}).unreadOnly).toBeUndefined();
  });

  it('refuses anything else', async () => {
    const errors = await validate(parse({ unreadOnly: 'yes' }));
    expect(errors.map((error) => error.property)).toEqual(['unreadOnly']);
  });
});
