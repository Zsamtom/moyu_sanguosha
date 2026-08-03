import { Tag } from 'antd';

export function formatBatchProductionModifier(
  yieldPercent: number,
  durationPercent: number,
): string | null {
  if (yieldPercent === 0 && durationPercent === 0) return null;
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value}%`;
  return `本批：产量 ${signed(yieldPercent)} · 工期 ${signed(durationPercent)}`;
}

export function ProductionModifierTag({
  yieldPercent,
  durationPercent,
}: {
  yieldPercent: number;
  durationPercent: number;
}) {
  const label = formatBatchProductionModifier(yieldPercent, durationPercent);
  if (!label) return null;
  const favorable = yieldPercent > 0 || durationPercent < 0;
  const adverse = yieldPercent < 0 || durationPercent > 0;
  const color = favorable && adverse ? 'gold' : adverse ? 'volcano' : 'green';
  return <Tag color={color}>{label}</Tag>;
}
