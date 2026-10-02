import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Book } from "./types";

/** Jev's top pick is acted on alone (opened) at this probability; below it, a clear lead is only preselected. */
const SURE = 0.8;

/** The TypeSafe API key: the extension preference, else `TYPESAFE_API_KEY` in ~/.config/typesafe/env. */
export function typesafeKey(preference?: string): string | undefined {
  if (preference?.trim()) return preference.trim();
  try {
    return readFileSync(join(homedir(), ".config/typesafe/env"), "utf8")
      .match(/^TYPESAFE_API_KEY=(.+)$/m)?.[1]
      .trim();
  } catch {
    return undefined;
  }
}

/**
 * Jev's (TypeSafe's) probability for each option, or undefined without a key, after 1.5 s, or on any error: this sits
 * on an interactive path, so callers just carry on as if it weren't there.
 */
async function jevChoice(
  key: string | undefined,
  state: unknown,
  instructions: string,
  options: Record<string, string>,
) {
  if (!key) return undefined;
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "jev-latest",
        state,
        questions: { pick: { type: "choice", instructions, criteria: options } },
      }),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return undefined;
    const { answers } = (await response.json()) as { answers: { pick: { probabilities: Record<string, number> } } };
    return answers.pick.probabilities;
  } catch {
    return undefined;
  }
}

/**
 * Jev's pick of the book a selection names, for when no title matches it outright (a typo, a series tag, a translated
 * or partial title): the book, and whether it's sure enough to open. Null when it picks none of them, or its pick
 * doesn't clearly lead (twice the runner-up); undefined when Jev can't be asked.
 */
export async function guessNamedBook(books: Book[], selection: string, key: string | undefined) {
  const options = Object.fromEntries(
    books.map((book, i) => [`b${i}`, `“${book.title}” by ${book.author}, ${book.ratingsCount ?? 0} ratings`]),
  );
  const probabilities = await jevChoice(
    key,
    { selection },
    "`selection` is text someone highlighted to look up one book on Goodreads. Which search result is that book? Its title may be partial, misspelled, missing punctuation or translated, and words around the title only help identify it: the author's name, a subtitle, or a series name and number.",
    {
      ...options,
      none: "None of them: `selection` names an author, a series, a different book, or something that isn't a title",
    },
  );
  if (!probabilities) return undefined;
  const [[label, p], [, runnerUp] = ["", 0]] = Object.entries(probabilities).sort(([, a], [, b]) => b - a);
  if (label === "none" || p < 2 * runnerUp) return null;
  return { book: books[Number(label.slice(1))], sure: p >= SURE };
}
