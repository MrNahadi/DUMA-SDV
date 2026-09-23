// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tokens } from './tokens';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const cssVar = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i'))?.[1];
const kebab = (name: string) => name.replace(/([a-z])(\d)/g, '$1-$2');

describe('design tokens', () => {
  it('tokens.ts mirrors every colour in tokens.css', () => {
    for (const [name, value] of Object.entries(tokens)) {
      expect(cssVar(kebab(name)), `--${kebab(name)}`).toBe(value);
    }
  });
});
