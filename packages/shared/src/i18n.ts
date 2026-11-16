import { z } from "zod";

export const LANGUAGES = ["en", "de"] as const;
export type Language = (typeof LANGUAGES)[number];
export const LanguageSchema = z.enum(LANGUAGES);

/** A plain string (in the pack's language) or a map of language → string. `en` is the fallback. */
export const LocalizedStringSchema = z.union([
  z.string().min(1),
  z.object({ en: z.string().min(1) }).catchall(z.string().min(1)),
]);
export type LocalizedString = z.infer<typeof LocalizedStringSchema>;

export function localize(s: LocalizedString | undefined, lang: Language = "en"): string {
  if (s === undefined) return "";
  if (typeof s === "string") return s;
  return (s as Record<string, string>)[lang] ?? s.en;
}

export function hasLanguage(s: LocalizedString, lang: Language, packLanguage: Language): boolean {
  if (typeof s === "string") return packLanguage === lang;
  return lang in s;
}
