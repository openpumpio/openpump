/**
 * Base error class for all OpenPump SDK errors.
 * All API errors are converted to typed exceptions.
 */
export class OpenPumpError extends Error {
  override readonly name: string = 'OpenPumpError';

  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the API key is invalid or missing (HTTP 401). */
export class AuthenticationError extends OpenPumpError {
  override readonly name = 'AuthenticationError';

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(code, message, status, details);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the rate limit is exceeded (HTTP 429). */
export class RateLimitError extends OpenPumpError {
  override readonly name = 'RateLimitError';

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(code, message, status, details);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when request validation fails (HTTP 422). */
export class ValidationError extends OpenPumpError {
  override readonly name = 'ValidationError';

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(code, message, status, details);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the requested resource is not found (HTTP 404). */
export class NotFoundError extends OpenPumpError {
  override readonly name = 'NotFoundError';

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(code, message, status, details);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the wallet has insufficient SOL or tokens for an operation. */
export class InsufficientFundsError extends OpenPumpError {
  override readonly name = 'InsufficientFundsError';

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(code, message, status, details);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when an on-chain transaction fails (signature error, simulation failure, etc.). */
export class TransactionError extends OpenPumpError {
  override readonly name = 'TransactionError';

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(code, message, status, details);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
