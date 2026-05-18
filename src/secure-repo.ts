typescript
import fs from 'fs/promises';
import path from 'path';
import { setTimeout } from 'timers/promises';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITLAB_PAT_REGEX = /^glpat-[a-zA-Z0-9_-]{20,}$/;
const DEFAULT_GITLAB_URL = 'https://gitlab.com';
const MIN_SCOPES = ['read_repository', 'write_repository'] as const;
const TOKEN_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB
const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface Configuration {
  readonly gitlabUrl: string;
  readonly tokenValue: string;
  readonly adminToken?: string;
  readonly repoPath: string;
  readonly patternsToIgnore: readonly string[];
  readonly logLevel: LogLevel;
  readonly dryRun: boolean;
}

/** Result of a token rotation operation */
export interface RotationResult {
  success: boolean;
  newToken?: string;
  error?: string;
}

/** Result of the full leak remediation pipeline */
export interface RemediationResult {
  tokenRevoked: boolean;
  tokenRotated: RotationResult;
  gitHistoryScrubbed: boolean;
  gitignoreUpdated: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Custom Error Classes
// ---------------------------------------------------------------------------

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class TokenError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'TokenError';
  }
}

export class GitOperationError extends Error {
  constructor(message: string, public readonly command?: string) {
    super(message);
    this.name = 'GitOperationError';
  }
}

export class ApiError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly body?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export class Logger {
  private static readonly LEVELS: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  private readonly level: number;
  private readonly timestamped: boolean;

  constructor(level?: LogLevel, timestamped = true) {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
    const effectiveLevel = envLevel ?? level ?? 'info';
    this.level = Logger.LEVELS[effectiveLevel] ?? 2;
    this.timestamped = timestamped;
  }

  private format(level: LogLevel, msg: string, ...args: unknown[]): string {
    const ts = this.timestamped ? `[${new Date().toISOString()}] ` : '';
    const meta = args.length > 0 ? ` ${args.map(a => JSON.stringify(a)).join(' ')}` : '';
    return `${ts}[${level.toUpperCase().padEnd(5)}] ${msg}${meta}`;
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.level >= Logger.LEVELS.error) {
      console.error(this.format('error', msg, ...args));
    }
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.level >= Logger.LEVELS.warn) {
      console.warn(this.format('warn', msg, ...args));
    }
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.level >= Logger.LEVELS.info) {
      console.log(this.format('info', msg, ...args));
    }
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.level >= Logger.LEVELS.debug) {
      console.debug(this.format('debug', msg, ...args));
    }
  }
}

// ---------------------------------------------------------------------------
// Validation Utilities
// ---------------------------------------------------------------------------

/**
 * Validates that a token string matches the GitLab Personal Access Token format.
 * @param token - The token to validate.
 * @returns `true` if the token is non-empty and matches the `glpat-` pattern.
 */
export function validateToken(token: string): boolean {
  if (typeof token !== 'string' || token.length === 0) return false;
  return GITLAB_PAT_REGEX.test(token);
}

/**
 * Checks that a given path points to an existing Git repository.
 * @param repoPath - Absolute or relative path.
 * @returns `true` if `.git` exists and is a directory.
 */
export async function validateRepoPath(repoPath: string): Promise<boolean> {
  try {
    const gitDir = path.resolve(repoPath, '.git');
    const stat = await fs.stat(gitDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Validates that a GitLab URL is a valid, non-empty string ending without a slash.
 * @param url - The URL to validate.
 * @returns `true` if the URL is valid.
 */
export function validateGitlabUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Configuration Loading
// ---------------------------------------------------------------------------

/**
 * Loads and validates configuration from environment variables.
 * Exits the process on critical validation failure.
 * @returns A validated {@link Configuration} object.
 */
export async function loadConfiguration(): Promise<Configuration> {
  const logLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) ?? 'info';
  const logger = new Logger(logLevel);
  const errors: string[] = [];

  // GitLab URL
  const rawUrl = process.env.GITLAB_URL?.trim() || DEFAULT_GITLAB_URL;
  const gitlabUrl = rawUrl.replace(/\/+$/, '');
  if (!validateGitlabUrl(gitlabUrl)) {
    errors.push(`Invalid GITLAB_URL: "${gitlabUrl}"`);
  }

  // Token
  const tokenValue = process.env.TOKEN_VALUE?.trim() || '';
  if (!tokenValue) {
    errors.push('Missing TOKEN_VALUE environment variable');
  } else if (!validateToken(tokenValue)) {
    errors.push('TOKEN_VALUE does not match GitLab PAT format (glpat-...)');
  }

  // Optional admin token
  const adminToken = process.env.ADMIN_TOKEN?.trim() || undefined;
  if (adminToken && !validateToken(adminToken)) {
    errors.push('ADMIN_TOKEN if provided must match glpat-... format');
  }

  // Repository path
  const repoPath = path.resolve(process.env.REPO_PATH?.trim() || process.cwd());
  const repoValid = await validateRepoPath(repoPath);
  if (!repoValid) {
    errors.push(`Repository path "${repoPath}" is not a valid Git repository`);
  }

  // Dry run flag
  const dryRun = process.env.DRY_RUN?.toLowerCase() === 'true';

  if (errors.length > 0) {
    for (const err of errors) {
      logger.error(err);
    }
    process.exit(1);
  }

  // Default patterns to ignore
  const patternsToIgnore: readonly string[] = [
    '05-Nautobot-custom-plugin-installation/nautobot/local.env',
  ];

  return {
    gitlabUrl,
    tokenValue: tokenValue!,
    adminToken,
    repoPath,
    patternsToIgnore,
    logLevel,
    dryRun,
  } as const;
}

// ---------------------------------------------------------------------------
// Rate‑Limited Fetch with Retries and Timeout
// ---------------------------------------------------------------------------

/**
 * Performs a fetch call with exponential backoff on rate limits (HTTP 429)
 * and an overall timeout.
 * @param url - The URL to request.
 * @param options - Fetch options.
 * @param retries - Number of retries remaining (default {@link RATE_LIMIT_RETRIES}).
 * @returns The {@link Response} object.
 * @throws {TokenError} If all retries are exhausted or a non‑429 error occurs.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = RATE_LIMIT_RETRIES,
  logger?: Logger
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });

    if (response.status === 429 && retries > 0) {
      const delay = RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, RATE_LIMIT_RETRIES - retries);
      if (logger) {
        logger.warn(`Rate limited, retrying in ${delay}ms (${retries} retries left)`);
      }
      await setTimeout(delay);
      return fetchWithRetry(url, options, retries - 1, logger);
    }

    return response;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TokenError(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw new TokenError(`Network error: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeoutId as unknown as NodeJS.Timeout);
  }
}

// ---------------------------------------------------------------------------
// GitLab API Helpers
// ---------------------------------------------------------------------------

/**
 * Makes an authenticated GitLab API request.
 * @param config - The configuration containing URL and token.
 * @param endpoint - API endpoint path (e.g., '/api/v4/personal_access_tokens').
 * @param method - HTTP method.
 * @param body - Optional request body (will be JSON‑serialized).
 * @returns Parsed JSON response.
 * @throws {ApiError} On non‑2xx response.
 * @throws {TokenError} On network/timeout errors.
 */
async function callGitLabApi<T = unknown>(
  config: Configuration,
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: Record<string, unknown>,
  logger?: Logger
): Promise<T> {
  const url = `${config.gitlabUrl}/api/v4${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const headers: Record<string, string> = {
    'PRIVATE-TOKEN': config.tokenValue,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  const fetchOptions: RequestInit = {
    method,
    headers,
  };
  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  if (logger) {
    logger.debug(`API call ${method} ${url}`);
  }

  const response = await fetchWithRetry(url, fetchOptions, RATE_LIMIT_RETRIES, logger);

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    throw new ApiError(
      `GitLab API error: ${response.status} ${response.statusText}`,
      response.status,
      responseBody
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Retrieves the current token's ID from GitLab.
 * @param config - Configuration.
 * @returns The token ID.
 * @throws {TokenError} If token is not found.
 */
async function getCurrentTokenId(config: Configuration, logger?: Logger): Promise<number> {
  const tokens = await callGitLabApi<Array<{ id: number; token: string; name: string }>>(
    config,
    '/personal_access_tokens',
    'GET',
    undefined,
    logger
  );

  const currentToken = tokens.find(t => t.token === config.tokenValue);
  if (!currentToken) {
    throw new TokenError('Current token not found in GitLab (may be expired or invalid)');
  }
  return currentToken.id;
}

// ---------------------------------------------------------------------------
// Token Revocation
// ---------------------------------------------------------------------------

/**
 * Revokes the compromised token in GitLab.
 * @param config - Configuration.
 * @returns `true` if successful.
 * @throws {TokenError} On revocation failure.
 */
export async function revokeToken(config: Configuration, logger?: Logger): Promise<boolean> {
  if (config.dryRun) {
    if (logger) logger.info('[DRY RUN] Would revoke token');
    return true;
  }

  const tokenId = await getCurrentTokenId(config, logger);
  try {
    await callGitLabApi<void>(config, `/personal_access_tokens/${tokenId}`, 'DELETE', undefined, logger);
    if (logger) logger.info(`Token ${config.tokenValue.substr(0, 10)}... revoked successfully`);
    return true;
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      throw new TokenError(`Failed to revoke token: ${error.message}`, error.statusCode);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Token Rotation
// ---------------------------------------------------------------------------

/**
 * Creates a new token with the same (or specified) scopes and name.
 * @param config - Configuration.
 * @param name - Name for the new token (default: "Rotated token").
 * @param scopes - Scopes for the new token (default: MIN_SCOPES).
 * @returns {@link RotationResult} containing success status and new token.
 */
export async function rotateToken(
  config: Configuration,
  name = 'Rotated token',
  scopes: readonly string[] = MIN_SCOPES,
  logger?: Logger
): Promise<RotationResult> {
  if (config.dryRun) {
    if (logger) logger.info('[DRY RUN] Would create new token');
    return { success: true, newToken: undefined };
  }

  try {
    const body: Record<string, unknown> = {
      name,
      scopes: Array.from(scopes),
      expires_at: new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString().split('T')[0],
    };

    const result = await callGitLabApi<{ token: string; id: number }>(
      config,
      '/personal_access_tokens',
      'POST',
      body,
      logger
    );

    if (logger) logger.info('New token created');
    return { success: true, newToken: result.token };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error during token rotation';
    if (logger) logger.error(`Token rotation failed: ${message}`);
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Git History Scrubbing (using git filter-repo or BFG)
// ---------------------------------------------------------------------------

/**
 * Removes a file from git history using `git filter-repo`.
 * Falls back to BFG if filter-repo is not available.
 * @param repoPath - Repository path.
 * @param filePattern - Path pattern to remove.
 * @param logger - Logger instance.
 * @returns `true` if scrubbing succeeded.
 * @throws {GitOperationError} If scrubbing fails.
 */
export async function scrubGitHistory(
  repoPath: string,
  filePattern: string,
  logger?: Logger
): Promise<boolean> {
  try {
    // First try git filter-repo (must be installed)
    const filterRepoCmd = `git filter-repo --path "${filePattern}" --invert-paths --force`;
    if (logger) {
      logger.info(`Running: ${filterRepoCmd}`);
    }
    execSync(filterRepoCmd, { cwd: repoPath, stdio: 'pipe' });
    return true;
  } catch (error: unknown) {
    // Fallback: use BFG (user must have BFG installed)
    try {
      const bfgCmd = `bfg --delete-files "${path.basename(filePattern)}" --delete-folders "${path.dirname(filePattern)}" --no-blob-protection`;
      if (logger) {
        logger.warn(`git filter-repo failed, trying BFG: ${bfgCmd}`);
      }
      execSync(bfgCmd, { cwd: repoPath, stdio: 'pipe' });
      return true;
    } catch (bfgError: unknown) {
      throw new GitOperationError(
        `Failed to scrub git history for pattern "${filePattern}". ` +
        `Ensure git filter-repo or BFG is installed. Error: ${(error as Error).message}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// .gitignore Update
// ---------------------------------------------------------------------------

/**
 * Appends patterns to `.gitignore` if not already present.
 * @param repoPath - Repository path.
 * @param patterns - Array of patterns to add.
 * @param logger - Logger instance.
 * @returns `true` if the file was updated.
 */
export async function updateGitignore(
  repoPath: string,
  patterns: readonly string[],
  logger?: Logger
): Promise<boolean> {
  const gitignorePath = path.join(repoPath, '.gitignore');
  let existingContent = '';
  try {
    existingContent = await fs.readFile(gitignorePath, 'utf-8');
  } catch {
    // .gitignore doesn't exist yet
  }

  const existingLines = new Set(existingContent.split(/\r?\n/));
  const newPatterns = patterns.filter(p => !existingLines.has(p));

  if (newPatterns.length === 0) {
    if (logger) logger.info('No new .gitignore patterns to add');
    return false;
  }

  const contentToAppend = newPatterns.join('\n');
  await fs.appendFile(gitignorePath, '\n' + contentToAppend + '\n');
  if (logger) {
    logger.info(`Added ${newPatterns.length} pattern(s) to .gitignore:\n${newPatterns.join('\n')}`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main Pipeline Orchestrator
// ---------------------------------------------------------------------------

/**
 * Runs the complete leak remediation pipeline:
 * 1. Revoke compromised token
 * 2. Rotate token
 * 3. Scrub git history
 * 4. Update .gitignore
 * @param config - Configuration.
 * @returns {@link RemediationResult} summarizing all actions.
 */
export async function runPipeline(config: Configuration, logger?: Logger): Promise<RemediationResult> {
  const log = logger ?? new Logger(config.logLevel);
  const result: RemediationResult = {
    tokenRevoked: false,
    tokenRotated: { success: false },
    gitHistoryScrubbed: false,
    gitignoreUpdated: false,
    errors: [],
    warnings: [],
  };

  // Step 1: Revoke token
  log.info('Step 1: Revoking compromised token...');
  try {
    result.tokenRevoked = await revokeToken(config, log);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Token revocation failed: ${msg}`);
    log.error(`Token revocation error: ${msg}`);
    // Continue despite failure – rotation may still work
  }

  // Step 2: Rotate token (create new one)
  log.info('Step 2: Rotating token...');
  result.tokenRotated = await rotateToken(config, undefined, undefined, log);
  if (!result.tokenRotated.success) {
    result.errors.push(`Token rotation failed: ${result.tokenRotated.error ?? 'Unknown'}`);
  }

  // Step 3: Scrub git history
  log.info('Step 3: Scrubbing git history...');
  for (const pattern of config.patternsToIgnore) {
    try {
      const scrubbed = await scrubGitHistory(config.repoPath, pattern, log);
      if (scrubbed) {
        result.gitHistoryScrubbed = true;
        log.info(`Git history scrubbed for pattern: ${pattern}`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Git history scrubbing failed for "${pattern}": ${msg}`);
      log.error(`Git scrubbing error: ${msg}`);
      // Continue with other patterns
    }
  }

  // Step 4: Update .gitignore
  log.info('Step 4: Updating .gitignore...');
  try {
    result.gitignoreUpdated = await updateGitignore(config.repoPath, config.patternsToIgnore, log);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`.gitignore update failed: ${msg}`);
    log.error(`Gitignore update error: ${msg}`);
  }

  // Summary
  log.info('=== Remediation Complete ===');
  log.info(`Token revoked: ${result.tokenRevoked}`);
  log.info(`Token rotated: ${result.tokenRotated.success}`);
  log.info(`Git history scrubbed: ${result.gitHistoryScrubbed}`);
  log.info(`.gitignore updated: ${result.gitignoreUpdated}`);

  if (result.errors.length > 0) {
    log.warn(`Errors encountered: ${result.errors.length}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main Entry Point (when run directly)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const logLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) ?? 'info';
  const logger = new Logger(logLevel);
  logger.info('Starting GitLab Token Remediation Pipeline');

  try {
    const config = await loadConfiguration();
    logger.info(`Dry run mode: ${config.dryRun}`);

    const result = await runPipeline(config, logger);

    if (result.errors.length > 0) {
      process.exit(1);
    }
  } catch (error: unknown) {
    logger.error('Fatal error in pipeline', error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export default main;