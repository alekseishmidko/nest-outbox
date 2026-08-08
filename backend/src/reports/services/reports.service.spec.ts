import { BadRequestException } from '@nestjs/common';
import { ReportsRepository } from '../repositories/reports.repository';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  it('декодирует cursor и передает его в repository', async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: '2026-08-09T00:00:00.000Z',
        orderId: 100,
      }),
      'utf8',
    ).toString('base64url');
    const repository = {
      findOrdersPage: jest.fn().mockResolvedValue({ items: [], pageInfo: {} }),
    };
    const service = new ReportsService(
      repository as unknown as ReportsRepository,
    );

    await service.findOrdersPage({
      pagination: 'cursor',
      limit: 20,
      cursor,
    });

    expect(repository.findOrdersPage).toHaveBeenCalledWith(
      {
        pagination: 'cursor',
        limit: 20,
        cursor,
      },
      {
        createdAt: new Date('2026-08-09T00:00:00.000Z'),
        orderId: 100,
      },
    );
  });

  it('возвращает 400 для некорректного cursor', async () => {
    const service = new ReportsService({} as unknown as ReportsRepository);

    expect(() =>
      service.findOrdersPage({
        pagination: 'cursor',
        cursor: 'invalid',
      }),
    ).toThrow(BadRequestException);
  });
});
