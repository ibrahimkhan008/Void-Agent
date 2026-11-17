import Link from "next/link";

export interface LegalTocSection {
  id: string;
  title: string;
}

function TocLinks({ sections }: { sections: LegalTocSection[] }) {
  return (
    <ol className="space-y-1 border-l border-black/10">
      {sections.map((section, index) => (
        <li key={section.id}>
          <Link
            href={`#${section.id}`}
            className="-ml-px grid grid-cols-[2ch_1fr] gap-2 border-l border-transparent py-1.5 pl-4 text-(--paper)/55 transition-colors hover:border-(--brand-glow) hover:text-(--paper)"
          >
            <span aria-hidden className="tabular-nums text-(--paper)/35">
              {index + 1}.
            </span>
            <span>{section.title}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function LegalToc({ sections }: { sections: LegalTocSection[] }) {
  return (
    <div>
      <p className="mb-3 px-4 text-[11px] font-medium tracking-[0.14em] text-(--paper)/45 uppercase">
        On this page
      </p>
      <TocLinks sections={sections} />
    </div>
  );
}

export function LegalTocCollapsible({
  sections,
}: {
  sections: LegalTocSection[];
}) {
  return (
    <details className="rounded-xl border border-black/10 bg-white/50 px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-(--paper)">
        On this page
      </summary>
      <div className="mt-4 text-sm">
        <TocLinks sections={sections} />
      </div>
    </details>
  );
}
