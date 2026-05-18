typescript
/**
 * Jest configuration for a TypeScript project.
 *
 * Provides a robust test environment with coverage collection,
 * mock management, and performance optimizations.
 */
import type { Config } from '@jest/types';

/**
 * Jest configuration object.
 * All paths are relative to the project root (where this file resides).
 */
const config: Config = {
  // Use ts-jest preset to handle TypeScript files
  preset: 'ts-jest',

  // Node environment (suitable for backend services)
  testEnvironment: 'node',

  // File extensions that Jest will look for
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Patterns to locate test files (both __tests__ folders and spec/test suffixed)
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts',
  ],

  // Transform TypeScript files using ts-jest
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  // Collect coverage from all source files (excluding node_modules, tests, and build artifacts)
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
  ],

  // Directory where coverage reports will be saved
  coverageDirectory: 'coverage',

  // Coverage reporters to generate
  coverageReporters: ['text', 'lcov', 'json', 'clover', 'html'],

  // Optional: enforce minimum coverage thresholds (uncomment and adjust as needed)
  // coverageThreshold: {
  //   global: {
  //     branches: 80,
  //     functions: 80,
  //     lines: 80,
  //     statements: 80,
  //   },
  // },

  // Root directories that Jest should scan for tests and modules
  roots: ['<rootDir>'],

  // Ignore patterns for test file discovery
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
  ],

  // Patterns to ignore during transformation (prevents processing of large libraries)
  transformIgnorePatterns: [
    '/node_modules/',
    '\\.pnp\\.[^\\/]+$',
  ],

  // Limit the number of workers for parallel test execution (good for CI)
  maxWorkers: '50%',

  // Clear mocks, reset modules, and restore mocks between tests to avoid state leaks
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Show deprecation warnings as errors
  errorOnDeprecated: true,

  // Verbose output for better readability
  verbose: true,

  // Global configuration for ts-jest
  globals: {
    'ts-jest': {
      // Use `isolatedModules: true` for faster compilation (if your code supports it)
      isolatedModules: true,
      // Optionally, specify a tsconfig file if not using the default
      // tsconfig: 'tsconfig.json',
    },
  },

  // Module name mapper for path aliases (if you use `@/` or similar in tsconfig paths)
  // moduleNameMapper: {
  //   '^@/(.*)$': '<rootDir>/src/$1',
  // },
};

export default config;