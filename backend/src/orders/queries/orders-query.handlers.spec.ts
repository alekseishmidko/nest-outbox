import { NotFoundException } from '@nestjs/common';
import {
  ListOrdersQueryHandler,
  OrderOverviewQueryHandler,
} from './orders-query.handlers';

describe('order query handlers', () => {
  it('delegates list pagination and overview reads to dedicated repository queries', async () => {
    const repository = {
      findAll: jest.fn().mockResolvedValue([]),
      findOverview: jest.fn().mockResolvedValue([{ orderId: 1 }]),
    };
    const list = new ListOrdersQueryHandler(repository as never);
    const overview = new OrderOverviewQueryHandler(repository as never);

    await expect(list.execute({ limit: 10, offset: 20 })).resolves.toEqual([]);
    await expect(overview.execute({ limit: 10, offset: 0 })).resolves.toEqual([
      { orderId: 1 },
    ]);
    expect(repository.findAll).toHaveBeenCalledWith({ limit: 10, offset: 20 });
    expect(repository.findOverview).toHaveBeenCalledWith({
      limit: 10,
      offset: 0,
    });
  });

  it('returns 404 for a missing order', async () => {
    const handler = new ListOrdersQueryHandler({
      findById: jest.fn().mockResolvedValue(null),
    } as never);
    await expect(handler.byId(999)).rejects.toThrow(NotFoundException);
  });
});
