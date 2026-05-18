import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger } from './logger'; // Assuming a logger module exists

/**
 * Manages .gitignore files by adding patterns to them.
 */
export class GitIgnoreManager {
  private logger = createLogger('GitIgnoreManager');

  /**
   * Adds one or more file patterns to the .gitignore in the given repository.
   * Creates the .gitignore file if it does not exist.
   * @param repoPath - Absolute or relative path to the root of the Git repository.
   * @param patterns - Array of file or directory patterns to ignore.
   */
  async addPattern(repoPath: string, patterns: string[]): Promise<void> {
    const gitIgnorePath = path.resolve(repoPath, '.gitignore');

    try {
      let content = '';
      try {
        content = await fs.readFile(gitIgnorePath, 'utf8');
        this.logger.debug('Read existing .gitignore file', gitIgnorePath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          this.logger.info('.gitignore does not exist, will create it', gitIgnorePath);
        } else {
          throw err;
        }
      }

      // Normalise content: ensure trailing newline
      if (content.length > 0 && !content.endsWith('\n')) {
        content += '\n';
      }

      // Add each pattern if not already present
      const lines = content.split('\n');
      const newPatterns = patterns.filter(pattern => !lines.includes(pattern));

      if (newPatterns.length === 0) {
        this.logger.info('All patterns already present in .gitignore');
        return;
      }

      const addition = newPatterns.map(p => p + '\n').join('');
      content += addition;

      await fs.writeFile(gitIgnorePath, content, 'utf8');
      this.logger.info('Added patterns to .gitignore', { patterns: newPatterns });
    } catch (error: unknown) {
      this.logger.error('Failed to update .gitignore', error as Error);
      throw error;
    }
  }
}