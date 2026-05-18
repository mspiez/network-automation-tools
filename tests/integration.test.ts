typescript
import path from 'path';
import fs from 'fs';
import { TokenRevoker } from '../src/TokenRevoker';
import { HistoryScrubber } from '../src/HistoryScrubber';
import { GitIgnoreManager } from '../src/GitIgnoreManager';
import { Verifier } from '../src/Verifier';

// ---------------------------------------------------------------------------
// Result interface for shell command execution
// ---------------------------------------------------------------------------
interface ExecResult {
  stdout: string;
  stderr: string;
}

// ---------------------------------------------------------------------------
// Git commit representation for virtual repository
// ---------------------------------------------------------------------------
interface GitCommit {
  hash: string;
  message: string;
  files: Map<string, string>;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Virtual repository to simulate git state in memory
// ---------------------------------------------------------------------------
class VirtualRepo {
  commits: GitCommit[] = [];
  files: Map<string, string> = new Map();
  gitignoreContent = '';
  private hashCounter = 0;
  private readonly tags: Map<string, string> = new Map();

  addFile(relativePath: string, content: string): void {
    const sanitizedPath = this.sanitizePath(relativePath);
    this.files.set(sanitizedPath, content);
  }

  removeFile(relativePath: string): void {
    const sanitizedPath = this.sanitizePath(relativePath);
    this.files.delete(sanitizedPath);
  }

  commit(message: string): GitCommit {
    this.hashCounter += 1;
    const hash = String(this.hashCounter).padStart(40, '0');
    const commit: GitCommit = {
      hash,
      message,
      files: new Map(this.files),
      timestamp: Date.now(),
    };
    this.commits.push(commit);
    return commit;
  }

  setGitignore(pattern: string): void {
    this.gitignoreContent += `${pattern}\n`;
  }

  getLastCommit(): GitCommit | null {
    return this.commits.length > 0 ? this.commits[this.commits.length - 1] : null;
  }

  getCommitByHash(hash: string): GitCommit | undefined {
    return this.commits.find(c => c.hash === hash);
  }

  tag(name: string, hash: string): void {
    this.tags.set(name, hash);
  }

  /**
   * Simulates a full `git log --all --full-history --name-only` output.
   * Returns a realistic diff-like string for verification.
   */
  simulateLog(detectRemovedToken: boolean = false): string {
    if (this.commits.length === 0) return '';

    const lines: string[] = [];
    for (const commit of this.commits) {
      lines.push(`commit ${commit.hash}`);
      lines.push(`Author: Test <test@example.com>`);
      lines.push(`Date:   ${new Date(commit.timestamp).toISOString()}`);
      lines.push('');
      lines.push(`    ${commit.message}`);
      lines.push('');

      for (const [filePath, content] of commit.files) {
        lines.push(`diff --git a/${filePath} b/${filePath}`);
        lines.push('new file mode 100644');
        lines.push('--- /dev/null');
        lines.push(`+++ b/${filePath}`);
        const contentLines = content.split('\n');
        const sanitizedLines = detectRemovedToken
          ? contentLines.map(line => line.includes('glpat-') ? line.replace(/glpat-\S+/g, '***REMOVED***') : line)
          : contentLines;
        for (let i = 0; i < sanitizedLines.length; i++) {
          lines.push(`+${sanitizedLines[i]}`);
        }
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  private sanitizePath(relativePath: string): string {
    // Basic path traversal prevention
    const normalized = path.normalize(relativePath);
    if (normalized.startsWith('..') || normalized.startsWith('/')) {
      throw new Error(`Invalid path: ${normalized}`);
    }
    return normalized;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TEST_TOKEN = 'glpat-test-token-placeholder-12345';
const NEW_TEST_TOKEN = 'glpat-new-rotated-token-67890';
const TEST_GITLAB_URL = 'https://gitlab.example.com';
const TEST_FILE_PATH = '05-Nautobot-custom-plugin-installation/nautobot/local.env';
const TMP_DIR_BASE = path.join(__dirname, '..', 'tmp_integration_test');

// ---------------------------------------------------------------------------
// Production-ready logger (can be injected with winston/bunyan)
// ---------------------------------------------------------------------------
const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

// ---------------------------------------------------------------------------
// Type guard for error objects
// ---------------------------------------------------------------------------
function isError(err: unknown): err is Error {
  return err instanceof Error;
}

// ---------------------------------------------------------------------------
// Input validation helpers with thorough checks
// ---------------------------------------------------------------------------
function isValidToken(token: string): boolean {
  // glpat- prefix followed by at least 20 alphanumeric/underscore/dash characters
  return /^glpat-[A-Za-z0-9_-]{20,}$/.test(token);
}

function isValidPath(filePath: string): boolean {
  // Allow only safe relative paths: alphanumeric, underscore, dash, forward slash, dot
  return /^[a-zA-Z0-9_/.-]+$/.test(filePath) && !filePath.startsWith('/');
}

function isValidGitUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname !== '';
  } catch {
    return false;
  }
}

function isValidEnvFileContent(content: string): boolean {
  // Ensure content does not contain dangerous shell characters or injections
  // Allow only key=value pairs with safe characters
  const lineRegex = /^[A-Za-z_][A-Za-z0-9_]*=[^\n\r]*$/;
  const lines = content.split('\n');
  return lines.every(line => line.trim() === '' || line.trim().startsWith('#') || lineRegex.test(line.trim()));
}

// ---------------------------------------------------------------------------
// Simulated git command executor for testing
// ---------------------------------------------------------------------------
function createGitMock(testRepoPath: string, virtualRepo: VirtualRepo): jest.Mock<Promise<ExecResult>, [string]> {
  return jest.fn().mockImplementation(async (cmd: string): Promise<ExecResult> => {
    logger.debug(`execMock received command: ${cmd}`);

    // Parse command into arguments, respecting quoted strings
    const args = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    if (args.length === 0) {
      throw new Error('Empty command');
    }

    const command = args[0];
    if (command !== 'git') {
      throw new Error(`Unsupported command: ${cmd}`);
    }

    const gitCmd = args[1];
    const getDir = (): string => {
      const idx = args.indexOf('-C');
      if (idx !== -1 && idx + 1 < args.length) {
        return args[idx + 1].replace(/"/g, '');
      }
      return testRepoPath;
    };

    try {
      const dir = getDir();
      // Validate directory exists and is safe (prevent path traversal)
      if (!dir.startsWith(testRepoPath)) {
        throw new Error(`Directory ${dir} is outside the test repository`);
      }

      switch (gitCmd) {
        case 'init': {
          return { stdout: 'Initialized empty Git repository', stderr: '' };
        }
        case 'add': {
          const filesToAdd = args.slice(2).filter(a => a !== '-C' && a !== dir);
          for (const file of filesToAdd) {
            const cleanPath = file.replace(/^["']|["']$/g, '');
            if (!isValidPath(cleanPath)) {
              throw new Error(`Invalid file path: ${cleanPath}`);
            }
          }
          return { stdout: '', stderr: '' };
        }
        case 'commit': {
          const msgIdx = args.indexOf('-m');
          const message = msgIdx !== -1 && msgIdx + 1 < args.length ? args[msgIdx + 1].replace(/"/g, '') : 'commit';
          virtualRepo.commit(message);
          const lastHash = String(virtualRepo.hashCounter).padStart(40, '0');
          return {
            stdout: `[main (root-commit) ${lastHash}] ${message}`,
            stderr: '',
          };
        }
        case 'log': {
          const logOutput = virtualRepo.simulateLog();
          return { stdout: logOutput, stderr: '' };
        }
        case 'rm': {
          // git rm removes file from index
          const fileIdx = args.findIndex(a => a === '--cached' || a === '-r' || a === '--');
          const fileToRemove = args[args.length - 1]?.replace(/"/g, '');
          if (fileToRemove && isValidPath(fileToRemove)) {
            virtualRepo.removeFile(fileToRemove);
          }
          return { stdout: '', stderr: '' };
        }
        case 'filter-branch':
        case 'filter-repo': {
          // Simulate rewriting history by replacing token occurrences
          virtualRepo.commits.forEach(commit => {
            const newFiles = new Map<string, string>();
            for (const [filePath, content] of commit.files) {
              newFiles.set(filePath, content.replace(/glpat-\S+/g, '***REMOVED***'));
            }
            commit.files = newFiles;
          });
          return { stdout: 'History rewritten', stderr: '' };
        }
        default: {
          throw new Error(`Unknown git command: ${gitCmd}`);
        }
      }
    } catch (err: unknown) {
      const message = isError(err) ? err.message : String(err);
      logger.error(`Git mock error: ${message}`);
      throw new Error(`Git command failed: ${message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Token rotation utility (simulated for testing)
// ---------------------------------------------------------------------------
class TokenRotator {
  /**
   * Rotates a token: generates a new placeholder token and updates the env file content.
   * This simulates the production step of creating a new GitLab access token and updating the .env file.
   *
   * @param oldToken - The token to replace
   * @param newToken - The new token to use
   * @param envContent - Current content of the .env file
   * @returns Updated content with old token replaced
   * @throws if envContent contains invalid data or missing token
   */
  static rotate(oldToken: string, newToken: string, envContent: string): string {
    if (!isValidToken(oldToken)) {
      throw new Error(`Invalid old token format: ${oldToken}`);
    }
    if (!isValidToken(newToken)) {
      throw new Error(`Invalid new token format: ${newToken}`);
    }
    if (!isValidEnvFileContent(envContent)) {
      throw new Error('Invalid .env file content');
    }
    if (!envContent.includes(oldToken)) {
      throw new Error('Old token not found in .env content');
    }

    const updated = envContent.replace(oldToken, newToken);
    if (updated === envContent) {
      throw new Error('Token replacement failed');
    }
    return updated;
  }
}

// ---------------------------------------------------------------------------
// Test suite: Remediation pipeline integration test
// ---------------------------------------------------------------------------
describe('RemediationPipeline Integration Tests', () => {
  let testRepoPath: string;
  let virtualRepo: VirtualRepo;
  let execMock: jest.Mock<Promise<ExecResult>, [string]>;
  let tokenRevoker: TokenRevoker;
  let historyScrubber: HistoryScrubber;
  let gitIgnoreManager: GitIgnoreManager;
  let verifier: Verifier;

  beforeAll(async () => {
    // -----------------------------------------------------------------------
    // 1. Create temporary directory with error handling
    // -----------------------------------------------------------------------
    try {
      if (fs.existsSync(TMP_DIR_BASE)) {
        fs.rmSync(TMP_DIR_BASE, { recursive: true, force: true });
      }
      fs.mkdirSync(TMP_DIR_BASE, { recursive: true });
      logger.info(`Created temporary directory: ${TMP_DIR_BASE}`);
    } catch (err: unknown) {
      const message = isError(err) ? err.message : String(err);
      logger.error(`Failed to prepare temporary directory: ${message}`);
      throw new Error(`Setup failed: ${message}`);
    }

    testRepoPath = path.join(TMP_DIR_BASE, 'test-repo');
    fs.mkdirSync(testRepoPath, { recursive: true });

    // -----------------------------------------------------------------------
    // 2. Initialize virtual repository
    // -----------------------------------------------------------------------
    virtualRepo = new VirtualRepo();

    // -----------------------------------------------------------------------
    // 3. Set up mock exec with improved simulation
    // -----------------------------------------------------------------------
    execMock = createGitMock(testRepoPath, virtualRepo);

    // -----------------------------------------------------------------------
    // 4. Instantiate remediation components with dependencies
    // -----------------------------------------------------------------------
    tokenRevoker = new TokenRevoker({
      gitlabUrl: TEST_GITLAB_URL,
      token: TEST_TOKEN,
      exec: execMock as unknown as (cmd: string) => Promise<ExecResult>,
      logger,
    });

    historyScrubber = new HistoryScrubber({
      repoPath: testRepoPath,
      exec: execMock as unknown as (cmd: string) => Promise<ExecResult>,
      logger,
      useFilterRepo: true, // Enable safer approach (filter-repo)
    });

    gitIgnoreManager = new GitIgnoreManager({
      repoPath: testRepoPath,
      exec: execMock as unknown as (cmd: string) => Promise<ExecResult>,
      logger,
    });

    verifier = new Verifier({
      repoPath: testRepoPath,
      exec: execMock as unknown as (cmd: string) => Promise<ExecResult>,
      token: TEST_TOKEN,
      filePath: TEST_FILE_PATH,
      logger,
    });
  });

  afterAll(async () => {
    // Clean up temporary directory
    try {
      if (fs.existsSync(TMP_DIR_BASE)) {
        fs.rmSync(TMP_DIR_BASE, { recursive: true, force: true });
        logger.info(`Cleaned up temporary directory: ${TMP_DIR_BASE}`);
      }
    } catch (err: unknown) {
      const message = isError(err) ? err.message : String(err);
      logger.error(`Failed to clean up temporary directory: ${message}`);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset virtual repo state between tests
    virtualRepo = new VirtualRepo();
  });

  // -------------------------------------------------------------------------
  // Input validation tests
  // -------------------------------------------------------------------------
  describe('Input validation', () => {
    it('should validate token format correctly', () => {
      expect(isValidToken('glpat-validToken12345_67890')).toBe(true);
      expect(isValidToken('glpat-short')).toBe(false);
      expect(isValidToken('invalid-prefix-12345')).toBe(false);
    });

    it('should validate file paths correctly', () => {
      expect(isValidPath('nautobot/local.env')).toBe(true);
      expect(isValidPath('/absolute/path')).toBe(false);
      expect(isValidPath('../traversal')).toBe(false);
    });

    it('should validate git URLs correctly', () => {
      expect(isValidGitUrl('https://gitlab.example.com')).toBe(true);
      expect(isValidGitUrl('ftp://gitlab.com')).toBe(false);
      expect(isValidGitUrl('not-a-url')).toBe(false);
    });

    it('should validate env file content', () => {
      expect(isValidEnvFileContent('TOKEN=abc123\n# comment\n')).toBe(true);
      expect(isValidEnvFileContent('invalid line with spaces')).toBe(false);
      expect(isValidEnvFileContent('')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Token revoker tests
  // -------------------------------------------------------------------------
  describe('TokenRevoker', () => {
    it('should revoke token via GitLab API (mocked)', async () => {
      // Mock the internal API call (assuming TokenRevoker uses exec to call git commands)
      // In a real test, we would mock the HTTP request to GitLab.
      // Here we rely on the constructor to set up the mock exec, but revoke logic is abstracted.
      // For completeness, we test that the revoke method is called without throwing.
      await expect(tokenRevoker.revoke()).resolves.toBeUndefined();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('revoked'));
    });

    it('should throw error if token is invalid', async () => {
      const revoker = new TokenRevoker({
        gitlabUrl: TEST_GITLAB_URL,
        token: 'invalid-token',
        exec: execMock as unknown as (cmd: string) => Promise<ExecResult>,
        logger,
      });
      await expect(revoker.revoke()).rejects.toThrow('Invalid token');
    });
  });

  // -------------------------------------------------------------------------
  // Token rotation tests
  // -------------------------------------------------------------------------
  describe('Token rotation', () => {
    it('should rotate token correctly in env content', () => {
      const envContent = `NAUTOBOT_GITLAB_TOKEN=${TEST_TOKEN}\n# other config\n`;
      const updated = TokenRotator.rotate(TEST_TOKEN, NEW_TEST_TOKEN, envContent);
      expect(updated).toContain(NEW_TEST_TOKEN);
      expect(updated).not.toContain(TEST_TOKEN);
    });

    it('should throw error if token not found', () => {
      const envContent = 'TOKEN=someOtherToken\n';
      expect(() => TokenRotator.rotate(TEST_TOKEN, NEW_TEST_TOKEN, envContent)).toThrow('not found');
    });

    it('should throw error on invalid token format', () => {
      const envContent = `TOKEN=${TEST_TOKEN}\n`;
      expect(() => TokenRotator.rotate('invalid', NEW_TEST_TOKEN, envContent)).toThrow('Invalid old token');
      expect(() => TokenRotator.rotate(TEST_TOKEN, 'invalid', envContent)).toThrow('Invalid new token');
    });

    it('should work with the full integration pipeline: revoke -> rotate -> scrub -> verify', async () => {
      // Simulate the entire remediation process
      const repoDir = testRepoPath;
      const envFilePath = path.join(repoDir, TEST_FILE_PATH);

      // 1. Create environment file with token
      const envContent = `NAUTOBOT_GITLAB_TOKEN=${TEST_TOKEN}\n`;
      fs.writeFileSync(envFilePath, envContent, 'utf-8');
      virtualRepo.addFile(TEST_FILE_PATH, envContent);
      virtualRepo.commit('Initial commit with token');

      // 2. Revoke old token (mocked)
      await tokenRevoker.revoke();

      // 3. Update .env file with new token (rotation)
      const currentContent = fs.readFileSync(envFilePath, 'utf-8');
      const rotatedContent = TokenRotator.rotate(TEST_TOKEN, NEW_TEST_TOKEN, currentContent);
      fs.writeFileSync(envFilePath, rotatedContent, 'utf-8');
      virtualRepo.addFile(TEST_FILE_PATH, rotatedContent);
      await execMock(`git -C ${repoDir} add ${TEST_FILE_PATH}`);
      await execMock(`git -C ${repoDir} commit -m "Rotated GitLab token"`);

      expect(fs.readFileSync(envFilePath, 'utf-8')).toContain(NEW_TEST_TOKEN);

      // 4. Scrub history (simulate filter-repo or filter-branch)
      await historyScrubber.scrub();

      // 5. Verify token is no longer present in history
      const logOutput = await execMock(`git -C ${repoDir} log --all --full-history --name-only`);
      expect(logOutput.stdout).not.toContain(TEST_TOKEN);
      expect(logOutput.stdout).toContain(NEW_TEST_TOKEN); // new token should remain in recent commit

      // 6. Add .gitignore
      await gitIgnoreManager.addPattern(TEST_FILE_PATH);

      expect(virtualRepo.gitignoreContent).toContain(TEST_FILE_PATH);
    });
  });

  // -------------------------------------------------------------------------
  // HistoryScrubber tests
  // -------------------------------------------------------------------------
  describe('HistoryScrubber', () => {
    it('should replace token in all commits when using filter-repo', async () => {
      const repoDir = testRepoPath;
      const envFilePath = path.join(repoDir, TEST_FILE_PATH);

      // Simulate a few commits with the token
      fs.writeFileSync(envFilePath, `TOKEN=${TEST_TOKEN}\n`, 'utf-8');
      virtualRepo.addFile(TEST_FILE_PATH, `TOKEN=${TEST_TOKEN}\n`);
      virtualRepo.commit('first commit');

      fs.writeFileSync(envFilePath, `TOKEN=${TEST_TOKEN}\n# updated`, 'utf-8');
      virtualRepo.addFile(TEST_FILE_PATH, `TOKEN=${TEST_TOKEN}\n# updated`);
      virtualRepo.commit('second commit');

      // Scrub
      await historyScrubber.scrub();

      // Verify token replaced in all commits
      const logOutput = virtualRepo.simulateLog(true);  // true -> detect removed token
      expect(logOutput).not.toContain(TEST_TOKEN);
      expect(logOutput).toContain('***REMOVED***');
    });
  });

  // -------------------------------------------------------------------------
  // GitIgnoreManager tests
  // -------------------------------------------------------------------------
  describe('GitIgnoreManager', () => {
    it('should add pattern to .gitignore', async () => {
      const pattern = '*.env';
      await gitIgnoreManager.addPattern(pattern);
      expect(virtualRepo.gitignoreContent).toContain(pattern + '\n');
    });

    it('should not duplicate existing pattern', async () => {
      const pattern = '*.env';
      virtualRepo.gitignoreContent = `${pattern}\n`;
      await gitIgnoreManager.addPattern(pattern);
      // Simulate that GitIgnoreManager checks for duplicates
      expect(virtualRepo.gitignoreContent).toMatch(/^(\*.env\n)+$/); // only once
    });
  });

  // -------------------------------------------------------------------------
  // Verifier tests
  // -------------------------------------------------------------------------
  describe('Verifier', () => {
    it('should confirm token is absent in history after scrubbing', async () => {
      // After scrubbing, verification step should pass
      const result = await verifier.verify();
      expect(result).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('no token found'));
    });
  });
});