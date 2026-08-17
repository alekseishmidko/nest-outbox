import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { Request } from 'express';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { Inject } from '@nestjs/common';
import { AuthUser } from '../types/auth-user.type';
import { RowDataPacket } from 'mysql2';

type OwnerRow = RowDataPacket & { owner_user_id: number };
type OrderOwnerRow = RowDataPacket & { user_id: number };
type MediaOwnerRow = RowDataPacket & { owner_type: string; owner_id: number };

type OwnedRequest = Request & { user?: AuthUser; route?: { path?: string } };

/** Проверяет, что user обращается только к собственным user/map/order/media данным. */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OwnedRequest>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Требуется authenticated user');
    if (user.role === 'admin') return true;

    const path = request.route?.path
      ? `${request.baseUrl}${request.route.path}`
      : request.path;
    const resourceId = Number(request.params.id);
    if (path.startsWith('/users')) {
      return this.allow(user.id === resourceId);
    }
    if (path.startsWith('/maps')) {
      if (path === '/maps' && request.method === 'POST') {
        return this.allow(
          user.id ===
            Number((request.body as { ownerUserId?: number }).ownerUserId),
        );
      }
      if (path === '/maps' && request.method === 'GET') {
        return this.allow(
          user.id ===
            Number((request.query as { ownerUserId?: number }).ownerUserId),
        );
      }
      return this.allow(await this.ownsMap(user.id, resourceId));
    }
    if (path.startsWith('/orders')) {
      if (path === '/orders' && request.method === 'POST') {
        return this.allow(
          user.id === Number((request.body as { userId?: number }).userId),
        );
      }
      if (path.includes('/users/')) {
        return this.allow(user.id === Number(request.params.userId));
      }
      if (path.includes('/maps/')) {
        return this.allow(
          await this.ownsMap(user.id, Number(request.params.mapId)),
        );
      }
      return this.allow(await this.ownsOrder(user.id, resourceId));
    }
    if (path.startsWith('/media/users/'))
      return this.allow(user.id === Number(request.params.userId));
    if (path.startsWith('/media/maps/'))
      return this.allow(
        await this.ownsMap(user.id, Number(request.params.mapId)),
      );
    if (path.startsWith('/media/'))
      return this.allow(await this.ownsMedia(user.id, resourceId));
    return true;
  }

  private allow(value: boolean): boolean {
    if (!value)
      throw new ForbiddenException(
        'Нет доступа к ресурсу другого пользователя',
      );
    return true;
  }

  private async ownsMap(userId: number, mapId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<OwnerRow[]>(
      'SELECT owner_user_id FROM maps WHERE id = ? LIMIT 1',
      [mapId],
    );
    return rows[0]?.owner_user_id === userId;
  }

  private async ownsOrder(userId: number, orderId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<OrderOwnerRow[]>(
      'SELECT user_id FROM orders WHERE id = ? LIMIT 1',
      [orderId],
    );
    return rows[0]?.user_id === userId;
  }

  private async ownsMedia(userId: number, mediaId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<MediaOwnerRow[]>(
      'SELECT owner_type, owner_id FROM media_assets WHERE id = ? LIMIT 1',
      [mediaId],
    );
    const media = rows[0];
    if (!media) return false;
    if (media.owner_type === 'user') return media.owner_id === userId;
    if (media.owner_type === 'map') return this.ownsMap(userId, media.owner_id);
    const [orders] = await this.pool.execute<OrderOwnerRow[]>(
      'SELECT user_id FROM orders WHERE id = ? LIMIT 1',
      [media.owner_id],
    );
    return orders[0]?.user_id === userId;
  }
}
