/**
 * Доменное представление пользователя, которое возвращается из repository.
 */
export type UserRecord = {
  id: number;
  email: string;
  name: string;
  avatarSeed: string;
  createdAt: Date;
  updatedAt: Date;
};
