/**
 * Search for the pack picker — pure functions, no React.
 *
 * People search a catalogue the way they talk about it: "leger", "Light",
 * "pack modéré", "une arcade", "3190", "integrl". So matching is:
 *   • accent- and case-insensitive, in every catalogue language at once;
 *   • token based — every meaningful word must match, filler words
 *     ("pack", "le", "de"…) are ignored;
 *   • strong on what an option IS (name, arcade, price), with a small
 *     typo allowance on pack names;
 *   • weak on what it SAYS (description, facts): those hits are only
 *     shown when nothing matches strongly, so "modere" lists Modéré
 *     alone instead of every pack whose blurb mentions moderate cases.
 */

/** Lower-case with accents folded, so "leger" finds "Léger". */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// "un" / "une" / "deux" are left in on purpose: they say which arcade.
const FILLER_WORDS = new Set([
  'pack', 'packs', 'forfait', 'forfaits', 'offre',
  'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'et', 'en', 'pour', 'avec',
  'the', 'of', 'and', 'for', 'with', 'in',
]);

/** Meaningful, folded words of a query. */
export function searchTokens(query: string): string[] {
  return foldForSearch(query)
    .split(/[\s'’,;:/()+]+/)
    .filter((token) => token && !FILLER_WORDS.has(token));
}

/** Optimal-string-alignment distance (insert, delete, swap, transpose). */
export function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = best;
    }
  }
  return rows[a.length][b.length];
}

/**
 * Whether `token` is a slightly mistyped `word` — or the start of it, so a
 * half-typed "modr" still finds "modere". Short tokens must be exact.
 */
function isNearMiss(token: string, word: string): boolean {
  const allowed = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;
  if (allowed === 0) return false;
  return (
    editDistance(token, word) <= allowed ||
    editDistance(token, word.slice(0, token.length)) <= allowed
  );
}

export interface Searchable {
  /** Folded name (all languages), arcade words and price. */
  primary: string;
  /** Folded words of the pack name(s), for typo tolerance. */
  nameWords: string[];
  /** `primary` plus description and facts. */
  haystack: string;
}

const STRONG = 2;
const FUZZY = 1;
const WEAK = 0;
const MISS = -1;

function tokenStrength(option: Searchable, token: string): number {
  if (option.primary.includes(token)) return STRONG;
  if (option.nameWords.some((word) => isNearMiss(token, word))) return FUZZY;
  if (option.haystack.includes(token)) return WEAK;
  return MISS;
}

/**
 * Filter and rank grouped options for a query. Groups and options keep
 * their catalogue order among equals; an empty query returns everything.
 */
export function searchGroups<O extends Searchable, G extends { options: O[] }>(
  groups: readonly G[],
  query: string,
): G[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return [...groups];

  const scored = groups.map((group) => ({
    group,
    options: group.options
      .map((option) => {
        const strengths = tokens.map((token) => tokenStrength(option, token));
        return {
          option,
          matches: strengths.every((s) => s !== MISS),
          strong: strengths.every((s) => s >= FUZZY),
          score: strengths.reduce((sum, s) => sum + s, 0),
        };
      })
      .filter((entry) => entry.matches),
  }));

  // Description-only hits are a fallback, never noise next to real hits.
  const anyStrong = scored.some((g) => g.options.some((o) => o.strong));
  return scored
    .map(({ group, options }) => {
      const kept = options
        .filter((o) => !anyStrong || o.strong)
        .sort((a, b) => b.score - a.score);
      return {
        group: { ...group, options: kept.map((o) => o.option) },
        best: kept[0]?.score ?? MISS,
      };
    })
    .filter(({ group }) => group.options.length > 0)
    .sort((a, b) => b.best - a.best)
    .map(({ group }) => group);
}
