// Exécuter les modules TypeScript locaux avec node:test, sans build intermédiaire.
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate
    if (specifier.startsWith('@/')) candidate = new URL('src/' + specifier.slice(2), root)
    else if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) candidate = new URL(specifier, context.parentURL)
    if (candidate) {
      const path = fileURLToPath(candidate)
      for (const suffix of ['', '.ts', '.tsx', '/index.ts']) {
        if (existsSync(path + suffix) && /\.(ts|tsx)$/.test(path + suffix)) {
          return { url: pathToFileURL(path + suffix).href, shortCircuit: true }
        }
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith(root.href) && !url.includes('/node_modules/') && /\.(ts|tsx)$/.test(url)) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
        fileName: fileURLToPath(url),
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
