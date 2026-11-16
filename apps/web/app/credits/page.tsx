import Link from "next/link";
import { BRANDING } from "@party-game/shared";
import credits from "../../public/icons/credits.json";

export const metadata = { title: `Credits · ${BRANDING.name}` };

export default function Credits() {
  const byAuthor = new Map<string, typeof credits>();
  for (const c of credits) byAuthor.set(c.author, [...(byAuthor.get(c.author) ?? []), c]);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-4xl text-accent">Credits & licenses</h1>
      <section className="card flex flex-col gap-2 p-5">
        <h2 className="font-display text-2xl">Icons</h2>
        <p>
          Icons from <a className="underline" href="https://game-icons.net">game-icons.net</a>, licensed under{" "}
          <a className="underline" href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>. Modified: background
          removed and recolored.
        </p>
        {[...byAuthor].map(([author, list]) => (
          <p key={author} className="text-sm text-muted">
            <span className="font-semibold text-ink">{author}</span>:{" "}
            {list.map((c, i) => (
              <span key={c.id}>
                <a className="underline" href={c.source}>{c.name}</a>
                {i < list.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
        ))}
        <p className="text-sm text-muted">UI icons: <a className="underline" href="https://lucide.dev">Lucide</a> (ISC license). Star and card shapes: original.</p>
      </section>
      <section className="card flex flex-col gap-2 p-5">
        <h2 className="font-display text-2xl">Sounds</h2>
        <p>All sound effects are synthesized by the project itself (<code>scripts/gen-sfx.mjs</code>) and released as CC0.</p>
      </section>
      <section className="card flex flex-col gap-2 p-5">
        <h2 className="font-display text-2xl">Fonts</h2>
        <p>Lilita One (Juan Montoreano) and Inter (Rasmus Andersson), SIL Open Font License 1.1.</p>
      </section>
      <section className="card flex flex-col gap-2 p-5">
        <h2 className="font-display text-2xl">Data</h2>
        <p>Optional Steam data via the Steam Web API. Not affiliated with Valve. Linked data is only used inside your room&apos;s game and can be deleted at any time.</p>
      </section>
      <Link href="/" className="btn-secondary self-start">Back</Link>
    </main>
  );
}
