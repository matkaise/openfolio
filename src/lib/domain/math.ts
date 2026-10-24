/** Whether two numbers differ by less than `tolerance` (numeric convergence, not money signs). */
export const isNear = (a: number, b: number, tolerance: number): boolean => a - b < tolerance && b - a < tolerance;
