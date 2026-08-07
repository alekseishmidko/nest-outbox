import { RowDataPacket } from 'mysql2';
import { IdempotencyKeyStatus } from './idempotency-key-status.type';

/**
 * Raw row таблицы `idempotency_keys`.
 */
export type IdempotencyKeyRow = RowDataPacket & {
  id: number;
  idempotency_key: string;
  request_hash: string;
  status: IdempotencyKeyStatus;
  response_status_code: number | null;
  response_body: unknown;
  created_at: Date;
  updated_at: Date;
};
