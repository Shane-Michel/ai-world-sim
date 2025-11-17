export function randomChoice(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
