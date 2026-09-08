export const colors = {
  bg: '#000000',
  surface: '#0E0E11',
  surfaceHi: '#1A1A20',
  border: '#26262E',
  text: '#FFFFFF',
  textDim: '#8A8A96',
  snap: '#FFFC00',
  snapInk: '#000000',
  ig: '#E1306C',
  tiktok: '#25F4EE',
  x: '#FFFFFF',
  wa: '#25D366',
  flame: '#FF6B2C',
  good: '#2BD97C',
  danger: '#FF4D4D',
} as const;

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const space = (n: number) => n * 4;

export const type = {
  display: { fontSize: 34, fontWeight: '900' as const, letterSpacing: -1 },
  h1: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 18, fontWeight: '800' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  label: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.6 },
  mono: { fontSize: 13, fontWeight: '600' as const },
} as const;
