#!/usr/bin/env node
/**
 * Hashira Placements Assignment - Constant Term Solver
 * Language: Node.js (JavaScript) — NOT Python
 * Purpose: Read JSON test case (no hardcoding), reconstruct the constant term `c` of the
 *          interpolating polynomial using EXACT rational arithmetic. Works for any k (degree m = k-1).
 *
 * How it works (high-level):
 *  - JSON has keys: { keys: { n, k }, "1": { base, value }, ...}
 *  - For each numeric property name i, we create a point (x=i, y= parse(value, base)).
 *  - Take any k points (we choose the smallest k x's deterministically).
 *  - Compute P(0) using Lagrange interpolation: c = P(0) = Σ y_i * Π_{j≠i} ( -x_j / (x_i - x_j) )
 *  - Do all math as BigInt rationals to avoid precision loss.
 *  - Print only the constant term `c` as a base-10 integer.
 *
 * Run:
 *    node hashira_constant_term_solver.js path/to/testcase.json
 * Example:
 *    node hashira_constant_term_solver.js sample1.json
 */

const fs = require('fs');

// --------- Helpers: BigInt GCD & Rational arithmetic ---------
function absBig(n) { return n < 0n ? -n : n; }
function gcdBig(a, b) {
  a = absBig(a); b = absBig(b);
  while (b !== 0n) { const t = a % b; a = b; b = t; }
  return a;
}

// Rational number r = num/den with BigInt; den always > 0
function makeR(num, den = 1n) {
  if (den === 0n) throw new Error('Zero denominator');
  if (den < 0n) { num = -num; den = -den; }
  const g = gcdBig(absBig(num), den);
  return { num: num / g, den: den / g };
}

function mulR(a, b) {
  // Cross-reduce before multiply for smaller numbers
  let n1 = a.num, d1 = a.den, n2 = b.num, d2 = b.den;
  const g1 = gcdBig(absBig(n1), d2);
  if (g1 !== 1n) { n1 /= g1; d2 /= g1; }
  const g2 = gcdBig(absBig(n2), d1);
  if (g2 !== 1n) { n2 /= g2; d1 /= g2; }
  return makeR(n1 * n2, d1 * d2);
}

function addR(a, b) {
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  return makeR(num, den);
}

// --------- Parse value string in given base (2..36) into BigInt ---------
function digitVal(ch) {
  const code = ch.codePointAt(0);
  if (code >= 48 && code <= 57) return BigInt(code - 48);             // '0'..'9'
  if (code >= 65 && code <= 90) return BigInt(code - 65 + 10);        // 'A'..'Z'
  if (code >= 97 && code <= 122) return BigInt(code - 97 + 10);       // 'a'..'z'
  return -1n;
}

function parseInBase(str, base) {
  if (base < 2 || base > 36) throw new Error(`Unsupported base ${base}`);
  let sign = 1n;
  let i = 0;
  if (str[0] === '+') { i = 1; } else if (str[0] === '-') { sign = -1n; i = 1; }
  let val = 0n;
  const B = BigInt(base);
  for (; i < str.length; i++) {
    const ch = str[i];
    if (ch === '_') continue; // allow numeric separators if present
    const d = digitVal(ch);
    if (d < 0n || d >= B) throw new Error(`Invalid digit '${ch}' for base ${base}`);
    val = val * B + d;
  }
  return sign * val;
}

// --------- Core: compute constant term c = P(0) via Lagrange ---------
function constantTermAtZero(points) {
  // points: array of {x: BigInt, y: BigInt}
  let result = makeR(0n, 1n);
  const n = points.length;
  for (let i = 0; i < n; i++) {
    let term = makeR(points[i].y, 1n);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const num = -points[j].x;                  // (0 - x_j)
      const den = points[i].x - points[j].x;     // (x_i - x_j)
      if (den === 0n) throw new Error('Duplicate x values encountered');
      term = mulR(term, makeR(num, den));
    }
    result = addR(result, term);
  }
  // result should be an integer
  if (result.num % result.den !== 0n) {
    // It *should* divide exactly; if not, still return reduced fraction as BigInt division (floors)
    // but we prefer to throw to signal unexpected input
    throw new Error(`Non-integer result: ${result.num}/${result.den}`);
  }
  return result.num / result.den;
}

// --------- Main ---------
(function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node hashira_constant_term_solver.js <path-to-json>');
    process.exit(1);
  }
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('Error reading file:', e.message);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(1);
  }

  if (!data.keys || typeof data.keys.k === 'undefined') {
    console.error('JSON must contain keys.k (minimum points required)');
    process.exit(1);
  }
  const k = BigInt(data.keys.k); // may be large, but we cast to Number for indexing later
  if (k <= 0n) {
    console.error('keys.k must be positive');
    process.exit(1);
  }

  // Collect all numeric-indexed points
  const pts = [];
  for (const prop of Object.keys(data)) {
    if (prop === 'keys') continue;
    if (!/^\d+$/.test(prop)) continue;
    const x = BigInt(prop);
    const entry = data[prop];
    if (!entry || typeof entry.base === 'undefined' || typeof entry.value === 'undefined') {
      console.error(`Entry '${prop}' must have base and value`);
      process.exit(1);
    }
    const base = Number(entry.base); // base in JSON is a string, convert
    const y = parseInBase(String(entry.value), base);
    pts.push({ x, y });
  }

  if (pts.length === 0) {
    console.error('No points found in JSON');
    process.exit(1);
  }

  // Sort by x ascending and take the first k points
  pts.sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0));
  const kNum = Number(k);
  if (pts.length < kNum) {
    console.error(`Not enough points: have ${pts.length}, need k=${kNum}`);
    process.exit(1);
  }

  const chosen = pts.slice(0, kNum);
  const c = constantTermAtZero(chosen);
  // Print only the constant term in base-10 (as required)
  console.log(String(c));
})();
