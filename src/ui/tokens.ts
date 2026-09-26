/**
 * Colour tokens for three.js materials and the PDF report, which cannot read CSS variables.
 * Must match tokens.css exactly; tokens.test.ts enforces it.
 */
export const tokens = {
  bg: '#fafaf9',
  surface: '#ffffff',
  surface2: '#f4f4f2',
  line: '#e6e5e1',
  ink: '#17181a',
  ink2: '#5c5f66',
  ink3: '#8e9199',
  accent: '#1f6f8b',
  ok: '#2e7d4f',
  warn: '#b7791f',
  fault: '#b3261e',
  roadSurface: '#cfcec8',
  roadMarking: '#ffffff',
  roadPost: '#8e9199',
  dataSpeed: '#0072b2',
  dataPower: '#c65300',
  dataSoc: '#007a5e',
} as const;

export type TokenName = keyof typeof tokens;
