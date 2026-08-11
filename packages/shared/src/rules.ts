export function resolveMajority(votes: Record<string, boolean>): boolean {
  const values = Object.values(votes);
  return values.filter(Boolean).length > values.length / 2;
}
