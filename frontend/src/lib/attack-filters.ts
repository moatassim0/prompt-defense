/** Rows excluded from adversarial attack pickers and catalog (benign baseline is a stress-test option only). */
function isAdversarialAttack(a: { id: string; category?: string }): boolean {
  return a.id !== 'benign-baseline' && a.category !== 'baseline';
}

export function filterAdversarialAttacks<T extends { id: string; category?: string }>(attacks: T[]): T[] {
  return attacks.filter(isAdversarialAttack);
}
