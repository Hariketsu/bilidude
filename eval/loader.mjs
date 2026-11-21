// Lets Node run the extension's TypeScript with its built-in type stripping: `@/` points at the repo
// root, and imports without an extension find their `.ts` file. Stripping can't handle syntax that
// needs compiling (parameter properties, enums), so the code avoids it.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);

registerHooks({
  resolve(specifier, context, next) {
    const local = specifier.startsWith('@/')
      ? new URL(specifier.slice(2), root)
      : specifier.startsWith('.') && context.parentURL?.startsWith(root.href) && !context.parentURL.includes('/node_modules/')
        ? new URL(specifier, context.parentURL)
        : undefined;
    if (local && !/\.[cm]?[jt]sx?$|\.json$/.test(local.pathname)) {
      const path = fileURLToPath(local);
      for (const candidate of [`${path}.ts`, `${path}.tsx`, `${path}/index.ts`]) {
        if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
      }
    }
    return next(local ? local.href : specifier, context);
  },
});
