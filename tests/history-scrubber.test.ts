import { HistoryScrubber } from '../src/HistoryScrubber';
import { exec } from 'child_process';
import { promisify } from 'util';

jest.mock('child_process');
const execAsync = promisify(exec);

describe('HistoryScrubber', () => {
  let scrubber: HistoryScrubber;

  beforeEach(() => {
    scrubber = new HistoryScrubber();
    jest.clearAllMocks();
  });

  describe('scrub', () => {
    const repoPath = '/path/to/repo';
    const tokenValue = 'glpat-xxxxxxxxxxxx';

    it('should execute git filter-repo command with correct arguments', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, _opts: any, cb: Function) => {
        cb(null, { stdout: '', stderr: '' });
      });

      await scrubber.scrub(repoPath, tokenValue);

      expect(exec).toHaveBeenCalledWith(
        `git filter-repo --force --path "local.env" --invert-paths --replace-text <(echo "${tokenValue}")`,
        expect.objectContaining({ cwd: repoPath }),
        expect.any(Function)
      );
    });

    it('should resolve when git filter-repo succeeds', async () => {
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        cb(null, { stdout: 'success', stderr: '' });
      });

      await expect(scrubber.scrub(repoPath, tokenValue)).resolves.toBeUndefined();
    });

    it('should reject when git filter-repo command fails', async () => {
      const error = new Error('Command failed');
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        cb(error, { stdout: '', stderr: 'error' });
      });

      await expect(scrubber.scrub(repoPath, tokenValue)).rejects.toThrow(
        'Git filter-repo failed: Command failed'
      );
    });

    it('should reject when exec throws synchronously', async () => {
      const error = new Error('exec error');
      (exec as unknown as jest.Mock).mockImplementation(() => {
        throw error;
      });

      await expect(scrubber.scrub(repoPath, tokenValue)).rejects.toThrow(
        'Git filter-repo execution error: exec error'
      );
    });

    it('should reject if token value is empty', async () => {
      await expect(scrubber.scrub(repoPath, '')).rejects.toThrow('Token value is required');
    });

    it('should reject if repo path is empty', async () => {
      await expect(scrubber.scrub('', tokenValue)).rejects.toThrow('Repository path is required');
    });
  });
});