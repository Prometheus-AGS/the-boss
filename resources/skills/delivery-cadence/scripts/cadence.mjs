import path from 'node:path';
import { promises as fs } from 'node:fs';
import { dispatch } from './lib/engine.mjs';

function parse(tokens) {
  const args = { _: [] };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token.startsWith('--')) { args._.push(token); continue; }
    const [key, inline] = token.slice(2).split(/=(.*)/s);
    args[key] = inline ?? (tokens[index + 1] && !tokens[index + 1].startsWith('--') ? tokens[++index] : true);
  }
  return args;
}

try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Delivery Cadence requires Node.js 22 or newer');
  const args = parse(process.argv.slice(2));
  if (args.help || !args._.length) {
    process.stdout.write('Delivery Cadence\nCommands: init, start, ready, checkpoint, finish, resume, status, report, configure, observe, activity, child, migrate, history, review, publication, hooks, candidate, work-ahead, job, tick\nOptions: --root <state-directory> --input <JSON-file> --command-id <stable-id>\nHooks: scaffold, add, list, enable, disable, remove, retry\n');
  } else {
    const root = path.resolve(typeof args.root === 'string' ? args.root : path.join(process.cwd(), '.prometheus', 'cadence'));
    args.input = typeof args.input === 'string' ? JSON.parse(await fs.readFile(path.resolve(args.input), 'utf8')) : {};
    args.commandId = typeof args['command-id'] === 'string' ? args['command-id'] : undefined;
    const result = await dispatch(root, args._[0], args.input, args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (args._[0] === 'checkpoint' && !['success','running','claimed'].includes(result.status)) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
  process.exitCode = 1;
}
