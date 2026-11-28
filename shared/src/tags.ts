import { z } from 'zod';

/*
 * A terminal's tags. Kept by themselves, so that what names a tag elsewhere (a theme for terminals by tag, in the
 * settings) uses the same rule without the settings depending on the entities.
 */

export const TAG_MAX_LENGTH = 32;
export const TAGS_MAX = 12;

/** One tag: a short string, trimmed. Capitals are kept, but `Api` and `api` are the same tag. */
export const Tag = z.string().trim().min(1).max(TAG_MAX_LENGTH);

/** Trims tags and drops empty ones and repeats. Capitals are kept, but `Api` and `api` are the same tag. */
export function normaliseTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (tag === '' || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    result.push(tag);
  }
  return result;
}

/** A session's tags: a short list of short strings, without repeats. */
export const Tags = z
  .array(Tag)
  .max(TAGS_MAX)
  // `overwrite`, not `transform`: the value is tidied but its kind stays the same, so it can still be described.
  .overwrite((tags) => normaliseTags(tags));

