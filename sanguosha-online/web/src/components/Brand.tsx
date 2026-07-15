interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={compact ? 'brand brand--compact' : 'brand'} aria-label="墨瑜三国杀">
      <span className="brand__seal" aria-hidden="true">杀</span>
      <span className="brand__text">
        <strong>墨瑜三国杀</strong>
        {!compact && <small>在线文字对战</small>}
      </span>
    </div>
  );
}
