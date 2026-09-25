// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tokens } from './tokens';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const cssVar = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i'))?.[1];
const kebab = (name: string) => name.replace(/([a-z])([A-Z\d])/g, '$1-$2').toLowerCase();

// WCAG relative luminance and contrast ratio.
const luminance = (hex: string) => {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

describe('design tokens', () => {
  it('tokens.ts mirrors every colour in tokens.css', () => {
    for (const [name, value] of Object.entries(tokens)) {
      expect(cssVar(kebab(name)), `--${kebab(name)}`).toBe(value);
    }
  });
  it('defines road surface, marking and post tokens', () => {
    expect(tokens).toHaveProperty('roadSurface');
    expect(tokens).toHaveProperty('roadMarking');
    expect(tokens).toHaveProperty('roadPost');
  });

  it('road marking contrasts with the road surface by at least 1.5:1', () => {
    expect(contrast(tokens.roadMarking, tokens.roadSurface)).toBeGreaterThanOrEqual(1.5);
  });
});
