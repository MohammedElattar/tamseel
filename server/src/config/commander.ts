// Special committee seats: EVAL1 = القائد (commander), EVAL9 = نائب القائد (deputy).
// They drive officer navigation and their votes mirror to each other.
export const COMMANDER_SEATS = ['EVAL1', 'EVAL9'];

export function isCommanderSeat(username: string | undefined | null): boolean {
  return !!username && COMMANDER_SEATS.includes(username);
}

export function deputyOf(username: string): string | null {
  if (username === 'EVAL1') return 'EVAL9';
  if (username === 'EVAL9') return 'EVAL1';
  return null;
}
