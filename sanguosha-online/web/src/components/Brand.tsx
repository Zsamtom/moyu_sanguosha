interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={compact ? 'brand brand--compact' : 'brand'} aria-label="墨鱼">
      <span className="brand__seal" aria-hidden="true">MY</span>
      <span className="brand__text">
        <strong>墨鱼</strong>
        {!compact && <small>GAMES &amp; UTILITIES</small>}
      </span>
    </div>
  );
}
