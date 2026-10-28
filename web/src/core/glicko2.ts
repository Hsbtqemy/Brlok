/**
 * Glicko-2 (Glickman, « Example of the Glicko-2 system »), le système de cotes de Lichess.
 * Utilisé pour les joueurs (échecs, grimpe, Chesscalade) et pour les blocs (REGLES.md §8).
 */

export interface Rating {
  rating: number;
  rd: number;
  volatility: number;
}

export interface GameResult {
  opponent: Rating;
  /** 1 = victoire (bloc réussi), 0 = défaite (chute), 0.5 = nulle. */
  score: number;
}

const SCALE = 173.7178;
const DEFAULT_TAU = 0.5;
const EPSILON = 0.000001;

export function newRating(rating = 1500): Rating {
  return { rating, rd: 350, volatility: 0.06 };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expected(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/** Probabilité que `player` batte `opponent`. */
export function winProbability(player: Rating, opponent: Rating): number {
  return expected((player.rating - 1500) / SCALE, (opponent.rating - 1500) / SCALE, opponent.rd / SCALE);
}

/** Met à jour une cote après une période de résultats. Sans résultat, seul le RD augmente. */
export function updateRating(player: Rating, results: readonly GameResult[], tau = DEFAULT_TAU): Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.volatility;

  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { ...player, rd: Math.min(350, phiStar * SCALE) };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const { opponent, score } of results) {
    const muJ = (opponent.rating - 1500) / SCALE;
    const phiJ = opponent.rd / SCALE;
    const e = expected(mu, muJ, phiJ);
    const gj = g(phiJ);
    vInv += gj * gj * e * (1 - e);
    deltaSum += gj * (score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Nouvelle volatilité (algorithme d'Illinois).
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;

  return { rating: newMu * SCALE + 1500, rd: newPhi * SCALE, volatility: newSigma };
}

/** Une tentative de bloc = un match joueur contre bloc : les deux cotes bougent. */
export function recordAttempt(climber: Rating, block: Rating, success: boolean): { climber: Rating; block: Rating } {
  return {
    climber: updateRating(climber, [{ opponent: block, score: success ? 1 : 0 }]),
    block: updateRating(block, [{ opponent: climber, score: success ? 0 : 1 }]),
  };
}
