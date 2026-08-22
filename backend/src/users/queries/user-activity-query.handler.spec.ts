import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserActivityQueryHandler } from './user-activity-query.handler';

describe('UserActivityQueryHandler', () => {
  it('normalizes offset and cursor pagination before querying activity', async () => {
    const page = {
      items: [],
      pageInfo: { pagination: 'cursor' as const, limit: 5, hasMore: false },
    };
    const cursor = Buffer.from(
      JSON.stringify({ createdAt: '2026-08-05T00:00:00.000Z', orderId: 10 }),
    ).toString('base64url');
    const repository = {
      findById: jest.fn().mockResolvedValue({ id: 1 }),
      findActivity: jest.fn().mockResolvedValue(page),
    };
    const handler = new UserActivityQueryHandler(repository as never);

    await expect(
      handler.execute(1, { pagination: 'cursor', limit: 5, cursor }),
    ).resolves.toBe(page);
    expect(repository.findActivity).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        pagination: 'cursor',
        limit: 5,
        cursor: {
          createdAt: new Date('2026-08-05T00:00:00.000Z'),
          orderId: 10,
        },
      }),
    );
  });

  it('rejects invalid cursors and missing users', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({ id: 1 }),
      findActivity: jest.fn(),
    };
    const handler = new UserActivityQueryHandler(repository as never);
    await expect(
      handler.execute(1, { pagination: 'cursor', cursor: 'invalid' }),
    ).rejects.toThrow(BadRequestException);
    repository.findById.mockResolvedValue(null);
    await expect(handler.execute(1, {})).rejects.toThrow(NotFoundException);
  });
});
