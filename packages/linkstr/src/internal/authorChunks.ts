/**
 * Relays cap filter complexity (strfry's maxFilterTerms and similar), and an
 * oversized `authors` list is often truncated silently rather than rejected —
 * indistinguishable from the missing authors having no events. 50 is a
 * conservative common denominator, so author sets are split to never exceed it.
 */
export const AUTHOR_FILTER_LIMIT = 50;

export const chunkAuthors = <A>(authors: ReadonlyArray<A>): Array<Array<A>> => {
  const chunks: Array<Array<A>> = [];
  for (let i = 0; i < authors.length; i += AUTHOR_FILTER_LIMIT) {
    chunks.push(authors.slice(i, i + AUTHOR_FILTER_LIMIT));
  }
  return chunks;
};
