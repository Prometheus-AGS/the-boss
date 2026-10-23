const { spawn } = require('node:child_process')

const child = spawn(process.argv[2], [], {
  env: { ...process.env, UAR_SIDECAR_STDIN_OVERLAPPED: '1' },
  stdio: ['overlapped', 'ignore', 'pipe'],
  windowsHide: true
})

let stderr = ''
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => {
  stderr += chunk
})
child.stdin.end('invalid-launch-token\n')
child.on('error', (error) => {
  process.stderr.write(error.message)
})
child.on('close', (code) => {
  process.stderr.write(stderr)
  process.exitCode = code ?? 1
})
