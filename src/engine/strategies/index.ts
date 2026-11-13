import { Strategy } from '@/types/strategy';
import { ictStrategy } from './ict-strategy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const STRATEGIES: Strategy<any>[] = [
  ictStrategy,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getStrategyById(id: string): Strategy<any> | undefined {
  return STRATEGIES.find((s) => s.id === id);
}

export { ictStrategy };
