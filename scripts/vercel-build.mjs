import { spawnSync } from 'node:child_process';

const defaults = {
  VITE_BASE_API_URL: process.env.PUBLIC_BASE_API_URL ?? '/',
  VITE_DOCUMENTATION_BASE_URL: 'https://docs.enclosed.cc',
  VITE_IS_AUTHENTICATION_REQUIRED: process.env.PUBLIC_IS_AUTHENTICATION_REQUIRED ?? 'false',
  VITE_DEFAULT_DELETE_NOTE_AFTER_READING: process.env.PUBLIC_DEFAULT_DELETE_NOTE_AFTER_READING ?? 'false',
  VITE_DEFAULT_NOTE_TTL_SECONDS: process.env.PUBLIC_DEFAULT_NOTE_TTL_SECONDS ?? '3600',
  VITE_DEFAULT_NOTE_NO_EXPIRATION: process.env.PUBLIC_DEFAULT_NOTE_NO_EXPIRATION ?? 'false',
  VITE_IS_SETTING_NO_EXPIRATION_ALLOWED: process.env.PUBLIC_IS_SETTING_NO_EXPIRATION_ALLOWED ?? 'true',
  VITE_VIEW_NOTE_PATH_PREFIX: process.env.PUBLIC_VIEW_NOTE_PATH_PREFIX ?? '/',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ||= value;
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(args) {
  const command = [pnpm, ...args.map(arg => JSON.stringify(arg))].join(' ');
  const result = spawnSync(command, {
    env: process.env,
    shell: true,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(['--filter', '@enclosed/crypto', 'run', 'build']);
run(['--filter', '@enclosed/lib', 'run', 'build']);
run([
  '--filter',
  '@enclosed/app-server',
  'exec',
  'esbuild',
  '../../scripts/vercel-function.ts',
  '--bundle',
  '--platform=node',
  '--target=node22',
  '--format=cjs',
  '--outfile=../../api/[...].js',
  '--footer:js=module.exports = module.exports.default;',
  '--log-level=warning',
]);
run(['--filter', '@enclosed/app-client', 'run', 'build']);
