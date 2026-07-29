/**
 * Доменное представление карты, которое возвращается из repository.
 */
export type MapRecord = {
  id: number;
  title: string;
  description: string | null;
  latitude: string;
  longitude: string;
  ownerUserId: number;
  createdAt: Date;
  updatedAt: Date;
};
