export const PG_ERROR_CODE = {
  INVALID_PARAMETER: '22023',
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  INSUFFICIENT_PRIVILEGE: '42501',
  CONFLICT: 'PT409',
  RATE_LIMITED: 'PT429',
} as const;

export type DomainErrorKind =
  | 'invalid_input'
  | 'session_expired'
  | 'forbidden'
  | 'conflict'
  | 'duplicate'
  | 'rate_limited'
  | 'requirements_unmet'
  | 'not_found'
  | 'unavailable';

export type RpcErrorLike = { code?: string | null } | null | undefined;

export function classifyRpcError(error: RpcErrorLike): DomainErrorKind {
  switch (error?.code) {
    case PG_ERROR_CODE.CONFLICT:
      return 'conflict';
    case PG_ERROR_CODE.RATE_LIMITED:
      return 'rate_limited';
    case PG_ERROR_CODE.UNIQUE_VIOLATION:
      return 'duplicate';
    case PG_ERROR_CODE.INSUFFICIENT_PRIVILEGE:
      return 'forbidden';
    case PG_ERROR_CODE.CHECK_VIOLATION:
      return 'requirements_unmet';
    case PG_ERROR_CODE.INVALID_PARAMETER:
    case PG_ERROR_CODE.FOREIGN_KEY_VIOLATION:
      return 'invalid_input';
    default:
      return 'unavailable';
  }
}
