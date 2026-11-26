import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { messages, translate } from '../src/lib/i18n';
import { adminMessages } from '../src/components/admin/i18n';

test('literal UI translation keys exist in the shared web and mobile dictionary', () => {
  const missing: string[] = [];
  for (const directory of ['src/components', 'src/app', 'mobile/src']) {
    for (const file of readdirSync(directory, { recursive: true })) {
      if (typeof file !== 'string' || !/\.tsx?$/.test(file)) continue;
      const filename = path.join(directory, file);
      const source = ts.createSourceFile(
        filename,
        readFileSync(filename, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 't' &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const key = node.arguments[0].text;
          // The administration console has its own dictionary.
          const dictionary = /[\\/]admin[\\/]/.test(filename) ? adminMessages : messages;
          if (!Object.hasOwn(dictionary, key)) missing.push(`${filename}: ${key}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  assert.deepEqual(missing, []);
  assert.equal(translate('he', 'constructor'), 'constructor');
  assert.equal(translate('en', 'toString'), 'toString');
});
