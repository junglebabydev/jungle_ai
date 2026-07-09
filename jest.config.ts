import type { Config } from "jest";

// Unit tests for the AI assistants (merchant + concierge internals). Each test
// mocks ServiceLocator / the model client per file, so the suite hits no real
// service, DB, or provider.
const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  verbose: true,
  setupFilesAfterEnv: ["<rootDir>/tests/setupTests.ts"],
  // ts-jest suites boot slower under contention; 30s keeps them green without
  // masking a real hang.
  testTimeout: 30000,
  maxWorkers: process.env.CI ? "50%" : 2,
  workerIdleMemoryLimit: "512MB",
  // Only compile/run the unit tests — the .mjs evals run under plain node.
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  // Use a test-only tsconfig (adds jest types + widens rootDir to include tests/)
  // so the production build config stays src-only.
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }],
  },
};

export default config;
