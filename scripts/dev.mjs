import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const localNode = path.join(root, '.tools/node-v24.15.0-win-x64/node.exe')
const node = process.platform === 'win32' && existsSync(localNode) ? localNode : process.execPath
const env = {
  ...process.env,
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:4200',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:4200',
}
const children = []
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  children.forEach(child => child.kill('SIGTERM'))
  process.exitCode = code
}
for (const [name, cwd, script, args] of [
  ['API', root, 'node_modules/next/dist/bin/next', ['dev', '--hostname', '127.0.0.1', '--port', '3000']],
  ['Angular', path.join(root, 'frontend'), 'node_modules/@angular/cli/bin/ng.js', ['serve', '--host', '127.0.0.1', '--port', '4200', '--proxy-config', 'proxy.conf.json']],
]) {
  const entry = path.join(cwd, script)
  if (!existsSync(entry)) throw new Error(`Dépendances ${name} absentes. Consultez README.md.`)
  const child = spawn(node, [entry, ...args], { cwd, env, stdio: 'inherit', windowsHide: true })
  children.push(child)
  child.on('error', error => { console.error(`${name}: ${error.message}`); stop(1) })
  child.on('exit', code => { if (!stopping) stop(code ?? 1) })
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
console.log('CoachSen Angular : http://127.0.0.1:4200 — API : http://127.0.0.1:3000/api/v1')
