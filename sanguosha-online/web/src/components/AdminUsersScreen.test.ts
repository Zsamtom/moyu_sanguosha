import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  clampLlmAuditCurrentPage,
  LLM_AUDIT_PAGE_SIZE,
} from './AdminUsersScreen';

describe('AdminUsersScreen LLM audit pagination', () => {
  it('keeps a selected audit page valid as the returned audit window changes', () => {
    expect(LLM_AUDIT_PAGE_SIZE).toBe(10);
    expect(clampLlmAuditCurrentPage(2, 25)).toBe(2);
    expect(clampLlmAuditCurrentPage(3, 11)).toBe(2);
    expect(clampLlmAuditCurrentPage(2, 0)).toBe(1);
  });

  it('uses its own controlled Ant Design pagination state', () => {
    const source = readFileSync(
      new URL('./AdminUsersScreen.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      'const [llmAuditCurrentPage, setLlmAuditCurrentPage] = useState(1);',
    );
    expect(source).toContain('current: llmAuditCurrent,');
    expect(source).toContain('pageSize: LLM_AUDIT_PAGE_SIZE,');
    expect(source).toContain('total: llmAuditTotal,');
    expect(source).toContain('onChange: (current) => setLlmAuditCurrentPage(current),');
  });
});
