typescript
import axios, { AxiosError, AxiosInstance } from 'axios';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { strict as assert } from 'assert';

// ---------------------------------------------------------------------------
// Logger Interface
// ---------------------------------------------------------------------------
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** Console-based logger that respects log levels */
export class ConsoleLogger implements Logger {
  constructor(private readonly level: 'debug' | 'info' | 'warn' | 'error' = 'info') {}

  debug(message: string, ...args: unknown[]): void {
    if (this.level === 'debug') {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }
  info(message: string, ...args: unknown[]): void {
    if (this.level === 'debug' || this.level === 'info') {
      console.info(`[INFO] ${message}`, ...args);
    }
  }
  warn(message: string, ...args: unknown[]): void {
    if (this.level !== 'error') {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }
  error(message: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------
export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerificationError';
  }
}

export class GitCommandError extends Error {
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(message: string, exitCode: number | null, stderr: string) {
    super(message);
    this.name = 'GitCommandError';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------
const TOKEN_PATTERN = /^glpat-[a-zA-Z0-9_-]{20,}$/;
const DEFAULT_GITLAB_URL = 'https://gitlab.com';
const FILE_RELATIVE_PATH = '05-Nautobot-custom-plugin-installation/nautobot/local.env';

const execFileAsync = promisify(execFile);

/** Validate that a string is a proper URL */
function isValidURL(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Options Interface
// ---------------------------------------------------------------------------
export interface VerifierOptions {
  repoPath: string;
  tokenValue: string;
  gitlabUrl?: string;
  httpClient?: AxiosInstance;
  logger?: Logger;
}

// ---------------------------------------------------------------------------
// Main Verifier Class
// ---------------------------------------------------------------------------
export class Verifier {
  private readonly repoPath: string;
  private readonly tokenValue: string;
  private readonly gitlabUrl: string;
  private readonly httpClient: AxiosInstance;
  private readonly logger: Logger;

  constructor(options: VerifierOptions) {
    assert.ok(options.repoPath && typeof options.repoPath === 'string', 'repoPath must be a non-empty string');
    assert.ok(TOKEN_PATTERN.test(options.tokenValue), 'tokenValue must be a valid GitLab Personal Access Token (glpat-...)');

    this.repoPath = options.repoPath;
    this.tokenValue = options.tokenValue;
    this.gitlabUrl = options.gitlabUrl ?? DEFAULT_GITLAB_URL;
    this.httpClient = options.httpClient ?? axios.create();
    this.logger = options.logger ?? new ConsoleLogger('info');

    if (!isValidURL(this.gitlabUrl)) {
      throw new VerificationError(`Invalid GitLab URL: ${this.gitlabUrl}`);
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Checks whether the token has been revoked via the GitLab API.
   *
   * Sends a GET request to the personal_access_tokens/self endpoint.
   * A 401 or 404 response indicates the token is revoked/does not exist.
   * A 200 response means the token is still active.
   *
   * @returns `true` if the token is revoked, `false` if still active.
   * @throws {VerificationError} on unexpected HTTP status or network failure.
   */
  public async checkTokenRevoked(): Promise<boolean> {
    const url = new URL('/api/v4/personal_access_tokens/self', this.gitlabUrl).toString();
    this.logger.info('Checking token revocation status via GitLab API...');

    try {
      const response = await this.httpClient.get(url, {
        headers: { 'PRIVATE-TOKEN': this.tokenValue },
        validateStatus: (_status: number) => true, // Accept any status for manual handling
      });

      const { status } = response;

      if (status === 200) {
        this.logger.warn('Token is still active – revocation is required.');
        return false;
      }

      if (status === 401 || status === 404) {
        this.logger.info(`Token appears revoked (HTTP ${status}).`);
        return true;
      }

      // Unexpected status code
      throw new VerificationError(`Unexpected response status: ${status}`);
    } catch (error: unknown) {
      // Axios throws for network errors, but we catch here to re‑throw consistently
      if (error instanceof AxiosError) {
        const errStatus = error.response?.status;
        if (errStatus === 401 || errStatus === 404) {
          this.logger.info(`Token is revoked (Axios error with status ${errStatus}).`);
          return true;
        }
        // Re‑throw the Axios error as a VerificationError for consistency
        throw new VerificationError(`Network or HTTP error while checking revocation: ${error.message}`);
      }
      // Re‑throw if it's already our custom error
      if (error instanceof VerificationError) {
        throw error;
      }
      // Unknown error
      throw new VerificationError(`Unexpected error during revocation check: ${String(error)}`);
    }
  }

  /**
   * Checks that the committed file at HEAD no longer contains the token.
   *
   * Uses `git show HEAD:<relativePath>` to retrieve the file content.
   * If the file does not exist in HEAD (e.g., was deleted), the check passes.
   *
   * @returns `true` if the token is absent from the file content, `false` if present.
   * @throws {GitCommandError} if the git command fails for reasons other than a missing file.
   * @throws {VerificationError} on invalid repo path or other unrecoverable errors.
   */
  public async checkHistoryClean(): Promise<boolean> {
    // Shell‑safe execution: use execFile with arguments to avoid injection
    const gitArgs = ['-C', this.repoPath, 'show', `HEAD:${FILE_RELATIVE_PATH}`];
    this.logger.info('Checking if token is still present in HEAD...', { gitArgs });

    try {
      const { stdout } = await execFileAsync('git', gitArgs, { maxBuffer: 10 * 1024 * 1024 });
      const content = stdout;

      if (content.includes(this.tokenValue)) {
        this.logger.warn('Token is STILL present in the file at HEAD.');
        return false;
      }

      this.logger.info('File is clean – token not found in HEAD.');
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        // Git reports missing file or invalid path via exit code 128 and a specific error message
        const gitError = error as NodeJS.ErrnoException & { code?: number; stderr?: string };
        const stderr = gitError.stderr ?? '';
        const exitCode = gitError.code ?? null;

        // Detect “path does not exist” or similar fatal errors that indicate file absence
        const fileMissingPatterns = [
          `fatal: path '${FILE_RELATIVE_PATH}' does not exist in 'HEAD'`,
          `fatal: Path '${FILE_RELATIVE_PATH}' exists on disk, but not in 'HEAD'`,
          `fatal: ambiguous argument 'HEAD:${FILE_RELATIVE_PATH}': unknown revision or path not in the working tree`,
        ];

        const isFileMissing = fileMissingPatterns.some(pattern => stderr.includes(pattern));

        if (isFileMissing) {
          this.logger.info('File no longer exists in HEAD – considered clean.');
          return true;
        }

        // Any other git error
        throw new GitCommandError(
          `Git command failed with exit code ${exitCode}: ${error.message}`,
          exitCode,
          stderr,
        );
      }
      throw new VerificationError(`Unexpected error during history check: ${String(error)}`);
    }
  }

  /**
   * Checks that the sensitive file path is listed in the repository's `.gitignore`.
   *
   * Reads `.gitignore` from the repo root and looks for an exact match of
   * the file relative path (as defined by `FILE_RELATIVE_PATH`).
   *
   * @returns `true` if the line is present, `false` if missing (or file doesn't exist).
   * @throws {VerificationError} if the `.gitignore` file cannot be read for reasons other than not found.
   */
  public async checkGitIgnoreEntry(): Promise<boolean> {
    const gitignorePath = join(this.repoPath, '.gitignore');
    this.logger.info('Checking .gitignore entry...', { gitignorePath });

    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      const lines = content.split(/\r?\n/);
      if (lines.includes(FILE_RELATIVE_PATH)) {
        this.logger.info('.gitignore entry found.');
        return true;
      }
      this.logger.warn('.gitignore does NOT contain the expected line.');
      return false;
    } catch (error: unknown) {
      if (error instanceof Error) {
        const fsError = error as NodeJS.ErrnoException;
        if (fsError.code === 'ENOENT') {
          this.logger.warn('.gitignore file does not exist – line cannot be present.');
          return false;
        }
        throw new VerificationError(`Failed to read .gitignore: ${error.message}`);
      }
      throw new VerificationError(`Unexpected error reading .gitignore: ${String(error)}`);
    }
  }
}