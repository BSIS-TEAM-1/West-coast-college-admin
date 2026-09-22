type SectionSkeletonProps = {
  /** Visual shape of the placeholder content. */
  variant?: 'table' | 'cards' | 'rows'
  /** How many placeholder rows/cards to render. */
  rows?: number
  /** Accessible label announced while content loads. */
  label?: string
}

/**
 * Section-level loading placeholder. Render it *inside* the section that is
 * loading (keeping headings, filters, and navigation interactive) instead of
 * replacing the whole page — async work should only block its own section.
 */
export default function SectionSkeleton({
  variant = 'rows',
  rows = 5,
  label = 'Loading content'
}: SectionSkeletonProps) {
  const count = Math.max(1, Math.min(rows, 12))

  return (
    <div className={`section-skeleton section-skeleton--${variant}`} role="status" aria-label={label}>
      <span className="section-skeleton__announcer">{label}…</span>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="section-skeleton__row" aria-hidden="true">
          {variant === 'table' ? (
            <>
              <span className="section-skeleton__bar section-skeleton__bar--narrow" />
              <span className="section-skeleton__bar section-skeleton__bar--wide" />
              <span className="section-skeleton__bar section-skeleton__bar--medium" />
              <span className="section-skeleton__bar section-skeleton__bar--narrow" />
            </>
          ) : variant === 'cards' ? (
            <>
              <span className="section-skeleton__bar section-skeleton__bar--title" />
              <span className="section-skeleton__bar section-skeleton__bar--wide" />
              <span className="section-skeleton__bar section-skeleton__bar--medium" />
            </>
          ) : (
            <span className="section-skeleton__bar section-skeleton__bar--wide" />
          )}
        </div>
      ))}
    </div>
  )
}
