/**
 * Единый формат ошибки HTTP API.
 */
export type ApiErrorResponse = {
  statusCode: number;
  errorCode: string;
  message: string;
  path: string;
  method: string;
  timestamp: string;
  requestId?: string;
  details?: unknown;
};
