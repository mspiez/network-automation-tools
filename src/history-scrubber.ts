typescript
import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------
class HistoryScrubberError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'HistoryScrubberError';
  }
}

class ValidationError extends HistoryScrubberError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class ToolError extends HistoryScrubberError {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

class GitOperationError extends HistoryScrubberError {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitOperationError';
  }
}

// ---------------------------------------------------------------------------
// Interfaces and constants
// ---------------------------------------------------------------------------
export interface HistoryScrubberOptions {
  /** Absolute or relative path to the Git repository root */
  repoPath: string;
  /** Secret value to be removed from history (e.g., glpat-...) */
  tokenValue: string;
  /** Maximum buffer size for child process stdout/stderr (default 50 MB) */
  maxBuffer?: number;
  /** Force scrubbing even if working tree is dirty (default true) */
  force?: boolean;
  /** Custom directory for temporary pattern files (defaults to system temp) */
  tempDir?: string;
  /** Perform a dry run without modifying the repository */
  dryRun?: boolean;
}

const DEFAULT_MAX_BUFFER = 50 * 1024 * 1024; // 50 MB
const REQUIRED_TOOLS = ['git', 'git-filter-repo'] as const;
const REPLACEMENT_STRING = 'REDACTED';
const MIN_TOKEN_LENGTH = 8;
const TOKEN_BLACKLIST_PATTERN = /==>|[\n\r]/; // patterns that would break the replacement syntax

// ---------------------------------------------------------------------------
// Helper: create a securely named temporary directory
// ---------------------------------------------------------------------------
async function createSecureTempDir(baseDir?: string): Promise<string> {
  const tmpRoot = baseDir || os.tmpdir();
  const dir = await fs.mkdtemp(path.join(tmpRoot, 'git-scrub-'));
  logger.debug(`Created temporary directory: ${dir}`);
  return dir;
}

// ---------------------------------------------------------------------------
// Helper: promisify execFile for robust error handling
// ---------------------------------------------------------------------------
function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
        encoding: 'utf-8' as BufferEncoding,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new GitOperationError(
              `Command '${command}' failed with exit code ${error.code ?? 'unknown'}`,
              command,
              error.code ?? null,
              stderr,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Helper: validate that the Git working tree is clean (unless forced)
// ---------------------------------------------------------------------------
async function ensureCleanWorkTree(
  repoPath: string,
  force: boolean,
): Promise<void> {
  if (force) {
    logger.warn('Force mode enabled – proceeding even if working tree is dirty.');
    return;
  }

  const { stdout } = await runCommand('git', ['status', '--porcelain'], {
    cwd: repoPath,
    maxBuffer: 1024 * 1024,
  });

  if (stdout.trim().length > 0) {
    throw new ValidationError(
      'Working tree has uncommitted changes. Commit, stash, or use `force: true` to proceed.',
    );
  }
}

// ---------------------------------------------------------------------------
// Public scrubber class
// ---------------------------------------------------------------------------
export class HistoryScrubber {
  /**
   * Validates that the given path exists and contains a `.git` directory/file.
   * @param repoPath - Path to validate
   * @returns Absolute, resolved repository path
   * @throws {ValidationError} if the path is invalid
   */
  private async validateRepoPath(repoPath: string): Promise<string> {
    const resolved = path.resolve(repoPath);

    // Check existence
    let stats: fs.Stats;
    try {
      stats = await fs.stat(resolved);
    } catch (err: unknown) {
      const nodeError = err as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        throw new ValidationError(`Repository path does not exist: ${resolved}`);
      }
      throw new ValidationError(`Cannot access repository path: ${resolved}`, err);
    }

    if (!stats.isDirectory()) {
      throw new ValidationError(`Repository path is not a directory: ${resolved}`);
    }

    // Check .git (directory or gitfile for worktrees)
    const gitPath = path.join(resolved, '.git');
    let gitStats: fs.Stats;
    try {
      gitStats = await fs.stat(gitPath);
    } catch (err: unknown) {
      const nodeError = err as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        throw new ValidationError(`Not a Git repository (missing .git): ${resolved}`);
      }
      throw new ValidationError(`Cannot check .git entry: ${resolved}`, err);
    }

    if (!gitStats.isDirectory() && !gitStats.isFile()) {
      throw new ValidationError(`Not a Git repository (invalid .git entry): ${resolved}`);
    }

    return resolved;
  }

  /**
   * Verifies that all required CLI tools are available and functional.
   * @throws {ToolError} if any tool is missing or fails
   */
  private async validateTools(): Promise<void> {
    for (const tool of REQUIRED_TOOLS) {
      try {
        await runCommand(tool, ['--version'], { maxBuffer: 1024 * 1024 });
      } catch (err: unknown) {
        throw new ToolError(
          `Required tool '${tool}' is not installed or not in PATH. ` +
            `Install git-filter-repo from: https://github.com/newren/git-filter-repo`,
          err,
        );
      }
    }
  }

  /**
   * Creates a temporary pattern file suitable for `git filter-repo --replace-text`.
   * The file contains a single line: `literal:<token>==>REDACTED`.
   * The file is placed in a dedicated temporary directory cleaned up later.
   * @param tokenValue - Secret string to replace (must not contain newlines or `==>`)
   * @param tempParentDir - Optional parent for the temporary directory
   * @returns Object containing the temporary directory path and the pattern file path
   * @throws {ValidationError} if token contains invalid characters
   */
  private async createPatternFile(
    tokenValue: string,
    tempParentDir?: string,
  ): Promise<{ dir: string; file: string }> {
    const dir = await createSecureTempDir(tempParentDir);
    const filePath = path.join(dir, 'replace-pattern.txt');

    // Pattern line format: literal:<old>==><new>
    // The token must not contain newlines or the `==>` separator sequence.
    if (TOKEN_BLACKLIST_PATTERN.test(tokenValue)) {
      throw new ValidationError(
        'Token value must not contain newline/carriage return or "==>" characters.',
      );
    }

    const patternLine = `literal:${tokenValue}==>${REPLACEMENT_STRING}\n`;
    await fs.writeFile(filePath, patternLine, 'utf-8');
    logger.debug(`Pattern file written: ${filePath}`);
    return { dir, file: filePath };
  }

  /**
   * Cleans up a temporary directory and its contents.
   * Errors are logged but not propagated to avoid masking primary failures.
   * @param dir - Absolute path to temporary directory
   */
  private async cleanupTempDir(dir: string): Promise<void> {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      logger.debug(`Temporary directory removed: ${dir}`);
    } catch (err: unknown) {
      logger.error({ err, dir }, 'Failed to remove temporary directory during cleanup');
    }
  }

  /**
   * Executes `git filter-repo` with the given arguments in the repository.
   * @param args - Array of command arguments (excluding `git filter-repo` itself)
   * @param repoPath - Working directory for the command
   * @param maxBuffer - Maximum stdout/stderr buffer size
   * @returns The combined stdout+stderr output
   */
  private async runFilterRepo(
    args: string[],
    repoPath: string,
    maxBuffer?: number,
  ): Promise<string> {
    const { stdout, stderr } = await runCommand('git', args, {
      cwd: repoPath,
      maxBuffer,
    });

    // Log any stderr output (git-filter-repo often writes progress there)
    if (stderr) {
      logger.debug({ stderr }, 'git-filter-repo stderr output');
    }

    return stdout;
  }

  /**
   * Scrubs all occurrences of the given token from the Git repository history
   * using `git filter-repo`. Operates on all branches, tags, and other refs.
   *
   * @param options - Configuration options
   * @throws {ValidationError} if input validation fails
   * @throws {ToolError} if required tools are missing
   * @throws {GitOperationError} if the underlying Git command fails
   * @throws {HistoryScrubberError} for any other unexpected failures
   */
  public async scrub(options: HistoryScrubberOptions): Promise<void> {
    const {
      repoPath,
      tokenValue,
      maxBuffer = DEFAULT_MAX_BUFFER,
      force = true,
      tempDir,
      dryRun = false,
    } = options;

    logger.info({
      repoPath,
      dryRun,
      force,
    }, 'History scrubbing initiated');

    // ===== Input validation =====
    if (!repoPath || typeof repoPath !== 'string') {
      throw new ValidationError('repoPath is required and must be a non-empty string');
    }
    if (!tokenValue || typeof tokenValue !== 'string') {
      throw new ValidationError('tokenValue is required and must be a non-empty string');
    }

    const trimmedToken = tokenValue.trim();
    if (trimmedToken.length < MIN_TOKEN_LENGTH) {
      logger.warn(
        `Token value is shorter than ${MIN_TOKEN_LENGTH} characters; double‑check that it is the full secret.`,
      );
    }

    if (trimmedToken === REPLACEMENT_STRING) {
      throw new ValidationError(`Token value cannot be equal to the replacement string '${REPLACEMENT_STRING}'`);
    }

    // Additional validation for pattern file safety
    if (TOKEN_BLACKLIST_PATTERN.test(trimmedToken)) {
      throw new ValidationError(
        'Token must not contain newline/carriage return or "==>" characters, as they break the replacement pattern.',
      );
    }

    // ===== Repository validation =====
    const resolvedRepo = await this.validateRepoPath(repoPath);
    logger.debug(`Resolved repository path: ${resolvedRepo}`);

    // ===== Working tree check =====
    await ensureCleanWorkTree(resolvedRepo, force);

    // ===== Tool validation =====
    await this.validateTools();

    // ===== Create pattern file in a secure temp directory =====
    let tempDirPath: string | undefined;
    let patternFilePath: string | undefined;
    let commandArgs: string[];

    try {
      const { dir, file } = await this.createPatternFile(trimmedToken, tempDir);
      tempDirPath = dir;
      patternFilePath = file;

      commandArgs = buildFilterRepoArgs(patternFilePath, force);

      if (dryRun) {
        logger.info('Dry run mode – scrub command would be: git %s', commandArgs.join(' '));
        return;
      }

      logger.info('Starting history rewrite with git-filter-repo...');
      // Execute git filter-repo
      await this.runFilterRepo(commandArgs, resolvedRepo, maxBuffer);

      logger.info('History rewrite completed successfully.');

      // Optional: verify that the token no longer appears in full history
      // (best-effort, may be time-consuming on large repos)
      logger.debug('Performing post‑scrub verification...');
      const verifyArgs = ['grep', '--cached', '-i', trimmedToken];
      try {
        const verifyResult = await this.runFilterRepo(verifyArgs, resolvedRepo, 1024 * 1024);
        if (verifyResult.length > 0) {
          logger.warn('Post‑scrub verification found remaining occurrences of the token. This may need manual review.');
        } else {
          logger.info('Verification: no remaining occurrences of the token found in Git history.');
        }
      } catch (err: unknown) {
        // git grep exits with 1 when no matches are found – that's expected
        const gitErr = err as GitOperationError;
        if (gitErr.exitCode === 1) {
          logger.info('Verification: no remaining occurrences of the token found in Git history.');
        } else {
          logger.error({ err }, 'Verification grep command failed (non‑critical).');
        }
      }
    } catch (err: unknown) {
      if (err instanceof HistoryScrubberError) {
        throw err;
      }
      throw new HistoryScrubberError('Unexpected error during scrubbing process', err);
    } finally {
      // Cleanup temporary directory regardless of success/failure
      if (tempDirPath) {
        await this.cleanupTempDir(tempDirPath);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: build the command arguments for git-filter-repo
// ---------------------------------------------------------------------------
function buildFilterRepoArgs(
  patternFilePath: string,
  force: boolean,
): string[] {
  const args: string[] = [
    'filter-repo',
    '--replace-text', patternFilePath,
    '--tag-filter', 'rename',
  ];
  if (force) {
    args.splice(1, 0, '--force');
  }
  return args;
}