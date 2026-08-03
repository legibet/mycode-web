/** Format a USD cost estimate: sub-cent amounts keep four decimals. */
export function formatCost(cost: number): string {
  return `$${cost > 0 && cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}`;
}
