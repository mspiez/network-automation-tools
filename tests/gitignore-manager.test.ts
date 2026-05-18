import { GitIgnoreManager } from '../src/gitignore-manager';
import fs from 'fs/promises';
import path from 'path';

jest.mock('fs/promises');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('GitIgnoreManager.addPattern', () => {
  const repoPath = '/mock/repo';
  const patterns = ['05-Nautobot-custom-plugin-installation/nautobot/local.env'];

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('creates .gitignore file if not exists', async () => {
    mockedFs.access.mockRejectedValue(new Error('ENOENT'));
    mockedFs.writeFile.mockResolvedValue(undefined);

    await GitIgnoreManager.addPattern(repoPath, patterns);

    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      path.join(repoPath, '.gitignore'),
      patterns.join('\n') + '\n',
      'utf-8'
    );
  });

  test('appends pattern to existing .gitignore without comment', async () => {
    const existingContent = 'node_modules/\n';
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue(existingContent);
    mockedFs.writeFile.mockResolvedValue(undefined);

    await GitIgnoreManager.addPattern(repoPath, patterns);

    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      path.join(repoPath, '.gitignore'),
      existingContent + patterns.join('\n') + '\n',
      'utf-8'
    );
  });

  test('does not duplicate pattern if already present', async () => {
    const existingContent = patterns[0] + '\n';
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue(existingContent);
    mockedFs.writeFile.mockResolvedValue(undefined);

    await GitIgnoreManager.addPattern(repoPath, patterns);

    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });

  test('handles multiple patterns', async () => {
    const multiPatterns = [
      '*.log',
      '05-Nautobot-custom-plugin-installation/nautobot/local.env',
      '.env'
    ];
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue('');
    mockedFs.writeFile.mockResolvedValue(undefined);

    await GitIgnoreManager.addPattern(repoPath, multiPatterns);

    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      path.join(repoPath, '.gitignore'),
      multiPatterns.join('\n') + '\n',
      'utf-8'
    );
  });

  test('throws on write error', async () => {
    mockedFs.access.mockRejectedValue(new Error('ENOENT'));
    const writeError = new Error('write failed');
    mockedFs.writeFile.mockRejectedValue(writeError);

    await expect(GitIgnoreManager.addPattern(repoPath, patterns)).rejects.toThrow('write failed');
  });

  test('preserves comment lines when appending', async () => {
    const existingContent = '# Ignore node modules\nnode_modules/\n';
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue(existingContent);
    mockedFs.writeFile.mockResolvedValue(undefined);

    await GitIgnoreManager.addPattern(repoPath, patterns);

    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      path.join(repoPath, '.gitignore'),
      existingContent + patterns.join('\n') + '\n',
      'utf-8'
    );
  });
});