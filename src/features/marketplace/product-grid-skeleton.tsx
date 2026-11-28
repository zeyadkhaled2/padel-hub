interface ProductGridSkeletonProps {
  heading: string;
  description: string;
  note: string;
  loadingLabel: string;
}

export function ProductGridSkeleton({ heading, description, note, loadingLabel }: ProductGridSkeletonProps) {
  return (
    <section className="market-section" aria-labelledby="equipment-heading">
      <div className="section-heading">
        <div>
          <h2 id="equipment-heading">{heading}</h2>
          <p>{description} · <span className="demo-inline-note">{note}</span></p>
        </div>
        <p className="result-count" role="status">{loadingLabel}</p>
      </div>
      <div className="product-grid-loading" role="group" aria-busy="true" aria-label={loadingLabel}>
        <div className="listing-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="product-skeleton" key={index}>
              <div className="product-skeleton-image" />
              <div className="listing-content product-skeleton-content">
                <div className="product-skeleton-line product-skeleton-tag" />
                <div className="product-skeleton-line product-skeleton-title" />
                <div className="product-skeleton-line product-skeleton-price" />
                <div className="product-skeleton-footer">
                  <div className="product-skeleton-line" />
                  <div className="product-skeleton-line" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
