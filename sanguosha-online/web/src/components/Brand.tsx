interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={compact ? 'brand brand--compact' : 'brand'} aria-label="摸鱼三国杀">
      <span className="brand__seal" aria-hidden="true">摸</span>
      <span className="brand__text">
        <strong>摸鱼三国杀</strong>
        {!compact && <small>内部协作工作区</small>}
      </span>
    </div>
  );
}
