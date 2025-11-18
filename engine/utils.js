export function randomChoice(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getLifeStage(ageDays) {
  if (ageDays < 18) return 'child';
  if (ageDays < 65) return 'adult';
  return 'elder';
}
