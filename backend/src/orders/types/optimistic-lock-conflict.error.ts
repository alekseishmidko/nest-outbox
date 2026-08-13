/** Возникает, когда заказ успели изменить после чтения клиентом. */
export class OptimisticLockConflictError extends Error {
  constructor(
    readonly orderId: number,
    readonly expectedVersion: number,
  ) {
    super(
      `Версия заказа ${orderId} устарела (ожидалась версия ${expectedVersion})`,
    );
    this.name = OptimisticLockConflictError.name;
  }
}
