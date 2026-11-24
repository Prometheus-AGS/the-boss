import { runExistingProjectMode } from './existing-project.mjs';

process.exitCode = runExistingProjectMode(process.argv.slice(2));
