import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '../..');
const srcRoot = resolvePath(repoRoot, 'src');

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function findTypeScriptFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    resolvePath(basePath, 'index.ts'),
    resolvePath(basePath, 'index.tsx'),
  ];
  return candidates.find(isFile) ?? null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = findTypeScriptFile(resolvePath(srcRoot, specifier.slice(2)));
    if (target) {
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
  }

  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL?.startsWith('file:')
  ) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    const target = findTypeScriptFile(resolvePath(parentDir, specifier));
    if (target && (target.endsWith('.ts') || target.endsWith('.tsx'))) {
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:')) {
    const filePath = fileURLToPath(url);
    const extension = extname(filePath);
    if (extension === '.ts' || extension === '.tsx') {
      const source = readFileSync(filePath, 'utf8');
      const { outputText } = ts.transpileModule(source, {
        fileName: filePath,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      });
      return { format: 'module', source: outputText, shortCircuit: true };
    }
  }

  return nextLoad(url, context);
}
