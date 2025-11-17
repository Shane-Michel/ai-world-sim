export function spriteForBiome(biome, richness) {
  const richnessTint = Math.min(1, richness / 3 + 0.2);
  switch (biome) {
    case 'forest':
      return `rgba(46, 204, 113, ${0.35 + richnessTint * 0.35})`;
    case 'hills':
      return `rgba(241, 196, 15, ${0.25 + richnessTint * 0.25})`;
    case 'coast':
      return `rgba(52, 152, 219, ${0.25 + richnessTint * 0.35})`;
    default:
    case 'plains':
      return `rgba(155, 197, 61, ${0.25 + richnessTint * 0.35})`;
  }
}
