export const PALETTE = [
  '#000080', '#008000', '#800000', '#800080',
  '#008080', '#808000', '#c00000', '#004080',
];

export const colorFor = (str) =>
  PALETTE[[...str].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];