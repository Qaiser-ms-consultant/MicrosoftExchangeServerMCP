export type ErrorCode =
  | "AUTH_FAILED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "PERMISSION_DENIED"
  | "VALIDATION_ERROR"
  | "NOT_IMPLEMENTED";

export class ExchangeError extends Error {
  code: ErrorCode;
  provider?: string;
  exchangeVersion?: string;
  requestId?: string;
  cause?: unknown;

  constructor(opts: {
    message: string;
    code: ErrorCode;
    provider?: string;
    exchangeVersion?: string;
    requestId?: string;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "ExchangeError";
    this.code = opts.code;
    this.provider = opts.provider;
    this.exchangeVersion = opts.exchangeVersion;
    this.requestId = opts.requestId;
    this.cause = opts.cause;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      provider: this.provider,
      exchangeVersion: this.exchangeVersion,
      requestId: this.requestId,
    };
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof ExchangeError) {
    return err.code === "RATE_LIMITED" || err.code === "SERVER_ERROR";
  }
  if (err instanceof Error && "response" in (err as any)) {
    const status = (err as any).response?.status;
    return status === 429 || (status >= 500 && status < 600);
  }
  return false;
}
