// Dual-package fixups after tsc: mark dist/cjs as CommonJS and make the
// ESM CLI entry executable.
import { chmodSync, writeFileSync } from 'node:fs';

writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
chmodSync('dist/esm/cli.js', 0o755);
