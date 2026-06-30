import { createHash } from 'node:crypto';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function hashNameToHue(name: string): number {
  const hash = fnv1a(name);
  return hash % 360;
}

export function dailySeed(date: string, count: number): number {
  if (count <= 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < date.length; i++) {
    sum += date.charCodeAt(i);
  }
  return sum % count;
}

export function sha256Short(input: string): string {
  const digest = createHash('sha256').update(input, 'utf-8').digest('hex');
  return digest.slice(0, 12);
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf-8').digest('hex');
}