import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const localNode = path.join(root, '.tools/node-v24.15.0-win-x64/node.exe')
const node = process.platform === 'win32' && existsSync(localNode) ? localNode : process.execPath
const cwd = path.join(root, 'frontend')
const result = spawnSync(node, [path.join(cwd, 'node_modules/@angular/cli/bin/ng.js'), ...process.argv.slice(2)], {
  cwd, stdio: 'inherit', windowsHide: true,
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
