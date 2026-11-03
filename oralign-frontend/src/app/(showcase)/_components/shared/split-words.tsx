import { Fragment, type CSSProperties, type ElementType } from "react";

type Run = {
  text: string;
  /** Wraps this run — an <em> for the accented half of a heading. */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
};

type Props = {
  as?: ElementType;
  id?: string;
  className?: string;
  style?: CSSProperties;
} & ({ text: string; runs?: never } | { runs: Run[]; text?: never });

/**
 * A heading whose words rise one after another (.sc-word, showcase.css)
 * when its <Reveal> scrolls in.
 *
 * The words stay real text in the HTML, so search engines read the
 * heading exactly as before. Screen readers get the whole sentence as
 * the element's name (aria-label) and skip the word spans, so nothing
 * is read one word at a time.
 */
export function RevealWords({ as: Tag = "h2", text, runs, ...rest }: Props) {
  const parts = runs ?? [{ text }];
  const label = parts.map((run) => run.text).join(" ");
  // Where each run's cascade starts: after the words of the runs before it.
  const starts: number[] = [];
  let count = 0;
  for (const run of parts) {
    starts.push(count);
    count += splitWords(run.text).length;
  }
  return (
    <Tag aria-label={label} {...rest}>
      {parts.map((run, r) => {
        const words = <Words text={run.text} start={starts[r]} />;
        const Wrap = run.as;
        return (
          <Fragment key={r}>
            {r > 0 ? " " : null}
            {Wrap ? (
              <Wrap className={run.className} style={run.style} aria-hidden="true">
                {words}
              </Wrap>
            ) : (
              words
            )}
          </Fragment>
        );
      })}
    </Tag>
  );
}

/**
 * The word spans alone, for a heading that composes its own element
 * (then give that element the sentence as aria-label, as RevealWords
 * does). `start` continues the cascade after an earlier run.
 *
 * Each span is an inline-block, which the bidi algorithm treats as a
 * neutral character: in an Arabic heading the words of a Latin phrase
 * would be laid out right to left. Words of one script are therefore
 * kept together in a span with their own `dir`, an isolated run that
 * reads in its own order. Keys are positions, so a language switch
 * updates the words in place instead of replaying their entrance.
 */
export function Words({ text, start = 0 }: { text: string; start?: number }) {
  const groups = groupByDirection(splitWords(text));
  // Rank of each group's first word in the cascade.
  const firsts: number[] = [];
  let next = start;
  for (const group of groups) {
    firsts.push(next);
    next += group.words.length;
  }
  return (
    <>
      {groups.map((group, g) => {
        const first = firsts[g];
        return (
          <Fragment key={g}>
            {g > 0 ? " " : null}
            <span dir={group.dir ?? undefined}>
              {group.words.map((word, w) => (
                <Fragment key={w}>
                  {w > 0 ? " " : null}
                  <span
                    aria-hidden="true"
                    className="sc-word"
                    style={{ "--i": first + w } as CSSProperties}
                  >
                    {word}
                  </span>
                </Fragment>
              ))}
            </span>
          </Fragment>
        );
      })}
    </>
  );
}

type Dir = "ltr" | "rtl";

const RTL_SCRIPT = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_SCRIPT = /\p{Script=Latin}/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function directionOf(word: string): Dir | null {
  if (RTL_SCRIPT.test(word)) return "rtl";
  if (LTR_SCRIPT.test(word)) return "ltr";
  return null;
}

/** Consecutive words of one script; a dash or a number joins its neighbours. */
function groupByDirection(words: string[]): { dir: Dir | null; words: string[] }[] {
  const groups: { dir: Dir | null; words: string[] }[] = [];
  for (const word of words) {
    const dir = directionOf(word);
    const last = groups[groups.length - 1];
    if (last && (dir === null || last.dir === null || last.dir === dir)) {
      last.words.push(word);
      last.dir ??= dir;
    } else {
      groups.push({ dir, words: [word] });
    }
  }
  return groups;
}

/**
 * Splits on ordinary spaces only: a no-break space stays inside its
 * word. A token that is only punctuation (a « ? » written after a plain
 * space) is kept with the word before it, so it can never wrap onto a
 * line of its own.
 */
function splitWords(text: string): string[] {
  const words: string[] = [];
  for (const token of text.split(/[ \t\n]+/)) {
    if (!token) continue;
    if (words.length && !LETTER_OR_DIGIT.test(token)) words[words.length - 1] += ` ${token}`;
    else words.push(token);
  }
  return words;
}
