import { OrderStatus } from '../../orders/dto/order-status.dto';

/**
 * Элемент отчета активности пользователя.
 */
export type UserActivityRecord = {
  user: {
    id: number;
    email: string;
    name: string;
    avatarAsset: {
      id: number;
      mimeType: string;
    } | null;
  };
  order: {
    id: number;
    status: OrderStatus;
    totalAmount: string;
    createdAt: Date;
  };
  map: {
    id: number;
    title: string;
    latitude: string;
    longitude: string;
    qrAsset: {
      id: number;
      mimeType: string;
    } | null;
  };
};
