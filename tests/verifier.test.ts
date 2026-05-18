import { Verifier } from '../src/verifier';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

jest.mock('child_process');
jest.mock('fs');
jest.mock('path');

describe('Verifier', () => {
  let verifier: Verifier;
  const repoPath = '/tmp/test-repo';
  const tokenValue = 'glpat-xxxxxx';
  const gitlabUrl = 'https://gitlab.example.com';

  beforeEach(() => {
    jest.clearAllMocks();
    verifier = new Verifier(repoPath, tokenValue, gitlabUrl);
  });

  test('should return true when all checks pass', async () => {
    (exec as jest.Mock).mockImplementation((cmd, cb) => {
      if (cmd.startsWith('curl')) {
        cb(null, { stdout: '', stderr: '' }, null);
      } else if (cmd.startsWith('git show')) {
        cb(null, { stdout: '', stderr: '' }, null);
      }
      return { on: jest.fn(), kill: jest.fn() };
    });
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('.gitignore content');
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));

    const result = await verifier.verify();
    expect(result).toBe(true);
  });

  test('should return false when token still in file', async () => {
    (exec as jest.Mock).mockImplementation((cmd, cb) => {
      if (cmd.startsWith('curl')) {
        cb(null, { stdout: '', stderr: '' }, null);
      } else if (cmd.startsWith('git show')) {
        cb(null, { stdout: 'glpat-xxxxxx', stderr: '' }, null);
      }
      return { on: jest.fn(), kill: jest.fn() };
    });
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const result = await verifier.verify();
    expect(result).toBe(false);
  });

  test('should return false when .gitignore missing', async () => {
    (exec as jest.Mock).mockImplementation((cmd, cb) => {
      if (cmd.startsWith('curl')) {
        cb(null, { stdout: '', stderr: '' }, null);
      } else if (cmd.startsWith('git show')) {
        cb(null, { stdout: '', stderr: '' }, null);
      }
      return { on: jest.fn(), kill: jest.fn() };
    });
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const result = await verifier.verify();
    expect(result).toBe(false);
  });

  test('should return false when token not revoked', async () => {
    (exec as jest.Mock).mockImplementation((cmd, cb) => {
      if (cmd.startsWith('curl')) {
        cb(new Error('401'), { stdout: '', stderr: '' }, null);
      }
      return { on: jest.fn(), kill: jest.fn() };
    });

    const result = await verifier.verify();
    expect(result).toBe(false);
  });

  test('should reject on exec error', async () => {
    (exec as jest.Mock).mockImplementation((cmd, cb) => {
      cb(new Error('exec failed'));
      return { on: jest.fn(), kill: jest.fn() };
    });

    await expect(verifier.verify()).rejects.toThrow('exec failed');
  });
});