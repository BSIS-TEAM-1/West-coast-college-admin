/**
 * Test runner split.
 *
 * Two suites — `enterprise-architecture.test.js` and `backup.test.js` — are
 * written against the built-in `node:test` / `node:assert` runner. Jest cannot
 * load them: it fails on `require('node:test')` wiring rather than on anything
 * the suites actually cover, which reads as a false regression.
 *
 * They are run with `node --test` (see the `test:node` script) and excluded
 * here. Everything else runs under Jest (`test:unit`).
 */
module.exports = {
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/enterprise-architecture\\.test\\.js$',
    '<rootDir>/backup\\.test\\.js$',
  ],
};
