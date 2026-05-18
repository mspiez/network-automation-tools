typescript
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { URL } from 'url';

/**
 * Configuration options for the TokenRevoker.
 */
export interface TokenRevokerOptions {
  /**
   * Base URL of the GitLab instance (e.g., "https://gitlab.com").
   * May include a path prefix if GitLab is hosted at a sub-path.
   */
  gitlabUrl: string;

  /**
   * Maximum number of retry attempts for transient failures.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay (in milliseconds) for exponential backoff between retries.
   * @default 1000
   */
  retryBaseDelay?: number;

  /**
   * HTTP request timeout in milliseconds.
   * @default 10000
   */
  requestTimeout?: number;

  /**
   * Enable debug logging (more verbose output).
   * @default false
   */
  debug?: boolean;
}

/**
 * Logger interface for structured logging.
 */
export interface Logger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Default logger using console with level prefixes.
 * In production, replace with a dedicated logging library (e.g., winston, pino).
 */
const defaultLogger: Logger = {
  debug: (msg, meta) => console.debug(`[TokenRevoker:debug] ${msg}`, meta ?? ''),
  info: (msg, meta) => console.info(`[TokenRevoker:info] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[TokenRevoker:warn] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[TokenRevoker:error] ${msg}`, meta ?? ''),
};

/**
 * Regular expressions for validating GitLab token format.
 */
const TOKEN_PATTERN = /^glpat-[A-Za-z0-9_-]{20,}$/;

/**
 * Validates a GitLab URL string.
 */
function isValidGitLabUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Revokes a GitLab personal access token via the GitLab API.
 * Implements retry with exponential backoff, configurable logging,
 * input validation, and safe token masking.
 */
export class TokenRevoker {
  private readonly axiosInstance: AxiosInstance;
  private readonly options: Required<TokenRevokerOptions>;
  private readonly logger: Logger;

  /**
   * Creates a new TokenRevoker instance.
   *
   * @param options - Configuration options.
   * @param logger  - Optional logger implementation (defaults to console with levels).
   * @throws {Error} If gitlabUrl is missing or invalid.
   */
  constructor(options: TokenRevokerOptions, logger?: Logger) {
    this.logger = logger ?? defaultLogger;
    this.options = {
      gitlabUrl: options.gitlabUrl.replace(/\/+$/, ''),
      maxRetries: options.maxRetries ?? 3,
      retryBaseDelay: options.retryBaseDelay ?? 1000,
      requestTimeout: options.requestTimeout ?? 10000,
      debug: options.debug ?? false,
    };

    if (!this.options.gitlabUrl || !isValidGitLabUrl(this.options.gitlabUrl)) {
      const message = `Invalid or missing gitlabUrl: "${this.options.gitlabUrl}"`;
      this.logger.error(message);
      throw new Error(message);
    }

    this.axiosInstance = axios.create({
      baseURL: this.options.gitlabUrl,
      timeout: this.options.requestTimeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'aigon-token-revoker/1.0',
      },
    });

    // Configure retry behaviour
    axiosRetry(this.axiosInstance, {
      retries: this.options.maxRetries,
      retryDelay: (retryCount: number): number => {
        // Exponential backoff: baseDelay * 2^(retryCount-1)
        const delay = this.options.retryBaseDelay * Math.pow(2, retryCount - 1);
        return delay;
      },
      retryCondition: (error: AxiosError): boolean => {
        // Retry on network errors, 429 (rate limit), and 5xx server errors (excluding 501, 505)
        if (axiosRetry.isNetworkOrIdempotentRequestError(error)) {
          return true;
        }
        const status = error.response?.status;
        if (status === 429 || (status && status >= 500 && status !== 501 && status !== 505)) {
          return true;
        }
        return false;
      },
      onRetry: (retryCount: number, error: AxiosError): void => {
        this.logger.warn(`Retry attempt ${retryCount} for ${error.config?.url}`, {
          retryCount,
          error: error.message,
        });
      },
    });
  }

  /**
   * Revokes the given GitLab personal access token.
   *
   * Uses the `POST /api/v4/personal_access_tokens/self/revoke` endpoint.
   * The token must have `api` scope for this operation.
   *
   * @param tokenValue - The personal access token value (must start with "glpat-").
   * @returns `true` if the token was successfully revoked, `false` otherwise.
   * @throws {Error} If tokenValue is invalid after validation.
   */
  public async revoke(tokenValue: string): Promise<boolean> {
    // Input validation
    if (!tokenValue || typeof tokenValue !== 'string') {
      this.logger.error('revoke called without a tokenValue string');
      return false;
    }

    const trimmedToken = tokenValue.trim();

    if (!TOKEN_PATTERN.test(trimmedToken)) {
      const message =
        'Token does not match expected GitLab PAT format (glpat- followed by at least 20 alphanumeric/underscore/hyphen characters)';
      this.logger.error(message, { tokenHint: this.maskToken(trimmedToken) });
      throw new Error(message);
    }

    const revokeUrl = '/api/v4/personal_access_tokens/self/revoke';

    try {
      if (this.options.debug) {
        this.logger.debug('Attempting token revocation', {
          gitlabUrl: this.options.gitlabUrl,
          tokenHint: this.maskToken(trimmedToken),
        });
      }

      const response = await this.axiosInstance.post(
        revokeUrl,
        null,
        {
          headers: {
            Authorization: `Bearer ${trimmedToken}`,
          },
        } as AxiosRequestConfig,
      );

      if (response.status === 204 || response.status === 200) {
        this.logger.info('Token revoked successfully', {
          status: response.status,
          gitlabUrl: this.options.gitlabUrl,
        });
        return true;
      }

      this.logger.warn('Unexpected status code from revocation endpoint', {
        status: response.status,
        gitlabUrl: this.options.gitlabUrl,
      });
      return false;
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const status = error.response?.status ?? 0;
        const data = error.response?.data as Record<string, unknown> | undefined;
        const message = (data?.message as string) || error.message || 'No error message';

        if (status === 429) {
          this.logger.warn('Rate limit hit during revocation (handled by retry logic)', {
            status,
            message,
          });
        } else if (status >= 400 && status < 500) {
          // Client errors (excluding 429 which is already handled)
          this.logger.error(`Client error (${status}) from GitLab API`, {
            status,
            message,
            endpoint: revokeUrl,
          });
        } else if (status >= 500) {
          this.logger.error(`Server error (${status}) from GitLab API`, {
            status,
            message,
            endpoint: revokeUrl,
          });
        } else {
          this.logger.error('Network or unknown error during revocation', {
            message: error.message,
            code: error.code,
          });
        }

        // Retry logic is handled internally; here we return false to indicate failure.
        return false;
      }

      // Non-Axios errors
      if (error instanceof Error) {
        this.logger.error('Unexpected error during revocation', {
          message: error.message,
          stack: error.stack,
        });
      } else {
        this.logger.error('Unknown non-error thrown', { error });
      }
      return false;
    }
  }

  /**
   * Masks the middle part of a token for safe logging.
   * Shows only the first 8 and last 4 characters.
   *
   * @param token - The full token value.
   * @returns Masked token string, or placeholder if token is too short.
   */
  private maskToken(token: string): string {
    if (token.length <= 12) {
      return token.slice(0, 2) + '***';
    }
    const prefix = token.slice(0, 8);
    const suffix = token.slice(-4);
    return `${prefix}...${suffix}`;
  }
}