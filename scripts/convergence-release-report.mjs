import { report } from './convergence/report.mjs'
const args = process.argv.slice(2); const options = { artifacts: [] }
for (let index = 0; index < args.length; index++) {
  const flag = args[index], value = args[++index]
  const key = { '--sources': 'sources', '--operation-receipts': 'operations', '--baseline': 'baseline',
    '--runtime-url': 'runtimeUrl', '--credential-env': 'credentialEnv', '--out': 'out' }[flag]
  if (!value) throw new Error('Missing value for ' + flag)
  if (flag === '--artifact') options.artifacts.push(value)
  else if (key) options[key] = value
  else throw new Error('Unknown argument ' + flag)
}
if (!options.sources || !options.out) throw new Error('Usage: --sources build/integration-sources.json --out <report.json> [--artifact <local installer>] [--operation-receipts <json array>] [--runtime-url <url> --credential-env <name>]')
try { console.log(JSON.stringify(await report(options))) }
catch (error) { console.error(error.message); process.exitCode = 1 }
