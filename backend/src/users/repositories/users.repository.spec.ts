import { OrderStatus } from '../../orders/dto/order-status.dto';
import { UsersRepository } from './users.repository';

describe('UsersRepository', () => {
  it('возвращает activity отчет с offset pageInfo и media asset ссылками', async () => {
    const createdAt = new Date('2026-08-05T00:00:00.000Z');
    const pool = {
      query: jest.fn().mockResolvedValue([
        [
          {
            user_id: 1,
            user_email: 'user@example.com',
            user_name: 'User',
            order_id: 10,
            order_status: OrderStatus.Pending,
            total_amount: '99.90',
            order_created_at: createdAt,
            map_id: 20,
            map_title: 'Map',
            latitude: '40.78509100',
            longitude: '-73.96828500',
            user_avatar_asset_id: 30,
            user_avatar_mime_type: 'image/svg+xml',
            map_qr_asset_id: 40,
            map_qr_mime_type: 'image/png',
          },
        ],
      ]),
    };
    const repository = new UsersRepository(pool as never);

    const page = await repository.findActivity(1, {
      pagination: 'offset',
      limit: 20,
      offset: 0,
      cursor: null,
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN'),
      [1, 21, 0],
    );
    expect(page).toEqual({
      items: [
        {
          user: {
            id: 1,
            email: 'user@example.com',
            name: 'User',
            avatarAsset: {
              id: 30,
              mimeType: 'image/svg+xml',
            },
          },
          order: {
            id: 10,
            status: OrderStatus.Pending,
            totalAmount: '99.90',
            createdAt,
          },
          map: {
            id: 20,
            title: 'Map',
            latitude: '40.78509100',
            longitude: '-73.96828500',
            qrAsset: {
              id: 40,
              mimeType: 'image/png',
            },
          },
        },
      ],
      pageInfo: {
        pagination: 'offset',
        limit: 20,
        offset: 0,
        hasMore: false,
      },
    });
  });

  it('возвращает nextCursor для cursor pagination, если есть следующая страница', async () => {
    const firstCreatedAt = new Date('2026-08-05T00:00:01.000Z');
    const secondCreatedAt = new Date('2026-08-05T00:00:00.000Z');
    const pool = {
      query: jest
        .fn()
        .mockResolvedValue([
          [activityRow(11, firstCreatedAt), activityRow(10, secondCreatedAt)],
        ]),
    };
    const repository = new UsersRepository(pool as never);

    const page = await repository.findActivity(1, {
      pagination: 'cursor',
      limit: 1,
      offset: 0,
      cursor: null,
    });

    expect(page.items).toHaveLength(1);
    expect(page.pageInfo.hasMore).toBe(true);
    expect(page.pageInfo.nextCursor).toEqual(expect.any(String));
  });
});

function activityRow(orderId: number, createdAt: Date) {
  return {
    user_id: 1,
    user_email: 'user@example.com',
    user_name: 'User',
    order_id: orderId,
    order_status: OrderStatus.Pending,
    total_amount: '99.90',
    order_created_at: createdAt,
    map_id: 20,
    map_title: 'Map',
    latitude: '40.78509100',
    longitude: '-73.96828500',
    user_avatar_asset_id: null,
    user_avatar_mime_type: null,
    map_qr_asset_id: null,
    map_qr_mime_type: null,
  };
}
