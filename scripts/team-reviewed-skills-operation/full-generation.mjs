import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import { digest, requireFact } from '../reusable-team-operation/io.mjs'
import { runFullSignatureScenarios } from './runtime-scenarios.mjs'

const exec = promisify(execFile)

function descendant(root, candidate) {
  const relative = path.relative(root, candidate)
  return Boolean(relative) && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)
}

function regularFile(file, code) {
  const resolved = fs.realpathSync(file)
  requireFact(fs.lstatSync(resolved).isFile(), code)
  return resolved
}

function sha256(file) {
  return 'sha256:' + digest(fs.readFileSync(file))
}

/**
 * Creates a fresh local signed generation solely beneath caller-owned isolated
 * output, then exercises the immutable packaged verifier's rejection paths.
 */
export async function createAndExerciseDisposableFullGeneration({
  executable, fullSourceRoot, outputRoot, isolatedUserData, verifierScript, signal, evidence
}) {
  requireFact(typeof executable === 'string' && executable, 'C15_FULL_GENERATION_EXECUTABLE_REQUIRED')
  requireFact(typeof outputRoot === 'string' && outputRoot, 'C15_FULL_GENERATION_OUTPUT_ROOT_REQUIRED')
  const isolated = fs.realpathSync(isolatedUserData)
  const requestedOutput = path.resolve(outputRoot)
  requireFact(descendant(isolated, requestedOutput), 'C15_FULL_GENERATION_OUTPUT_NOT_ISOLATED')
  requireFact(!fs.existsSync(requestedOutput), 'C15_FULL_GENERATION_OUTPUT_ALREADY_EXISTS')
  const source = fs.realpathSync(fullSourceRoot)
  const installer = regularFile(path.join(source, 'scripts', 'install-plugin-generation.js'),
    'C15_FULL_GENERATION_INSTALLER_UNAVAILABLE')
  const verifier = regularFile(verifierScript, 'C15_IMMUTABLE_EXTERNAL_VERIFIER_UNAVAILABLE')

  fs.mkdirSync(requestedOutput, { mode: 0o700 })
  const output = fs.realpathSync(requestedOutput)
  requireFact(descendant(isolated, output) && !descendant(output, verifier),
    'C15_IMMUTABLE_EXTERNAL_VERIFIER_REQUIRED')
  const home = path.join(output, 'home')
  const pluginRoot = path.join(output, 'plugin-root')
  const trustStore = path.join(pluginRoot, 'trust', 'allowed-signers.json')
  fs.mkdirSync(home, { mode: 0o700 })
  signal.throwIfAborted()
  await exec(executable, [installer, '--source-root', source, '--plugin-root', pluginRoot,
    '--home', home, '--trust-store', trustStore], {
    signal,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    maxBuffer: 64 * 1024 * 1024
  })
  signal.throwIfAborted()
  const signatureScenarios = await runFullSignatureScenarios({
    executable,
    script: verifier,
    pluginRoot,
    home,
    trustStore,
    isolatedUserData: isolated,
    signal,
    evidence
  })
  const result = {
    sourceClass: 'signed-full-generation',
    signerProvenance: 'local-disposable-existing-installer-pipeline',
    executionRuntime: executable === process.execPath ? 'node-process-exec-path' : 'caller-supplied-runtime',
    installer: { sha256: sha256(installer) },
    verifier: { sha256: sha256(verifier) },
    signatureScenarios,
    complete: signatureScenarios.every((scenario) => scenario.status === 'passed')
  }
  evidence.fullGeneration = result
  requireFact(result.complete, 'C15_DISPOSABLE_FULL_SIGNATURE_SCENARIOS_INCOMPLETE')
  return result
}
