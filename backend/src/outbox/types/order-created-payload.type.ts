/**
 * Payload события `order.created`.
 */
export type OrderCreatedPayload = {
  orderId: number;
  userId: number;
  mapId: number;
  totalAmount?: number;
};
