export function isLatestRequest(
  requestId: number,
  latestRequestId: number,
): boolean {
  return requestId === latestRequestId;
}

export function isRevisionVectorAtLeast(
  next: readonly number[],
  current?: readonly number[],
): boolean {
  if (!current) return true;
  if (next.length !== current.length) return false;
  return next.every((revision, index) => revision >= current[index]!);
}
