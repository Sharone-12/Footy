/**
 * Independent-Poisson scoreline model: given each side's expected goals, the
 * chance of a home win, a draw and an away win. Shared by the match
 * predictions (expected goals from team strength) and the justice table
 * (expected goals from the chances a match actually produced).
 */

function poisson(lambda: number, k: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k)
}

function factorial(n: number): number {
  if (n <= 1) return 1
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

export function matchProbabilities(
  homeExpected: number,
  awayExpected: number,
  maxGoals = 7,
): { homeWin: number; draw: number; awayWin: number } {
  let homeWin = 0
  let draw = 0
  let awayWin = 0

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poisson(homeExpected, h) * poisson(awayExpected, a)
      if (h > a) homeWin += p
      else if (h === a) draw += p
      else awayWin += p
    }
  }

  const total = homeWin + draw + awayWin
  return {
    homeWin: homeWin / total,
    draw: draw / total,
    awayWin: awayWin / total,
  }
}
