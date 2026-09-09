import { describe, expect, it } from 'vitest';
import { runTool } from './tools.js';

describe('agent tools', () => {
  it('evaluates arithmetic safely', async () => {
    expect(JSON.parse(await runTool('calculate', { expression: '(1250 * 1.12) / 10' })).result).toBe(140);
  });

  it('rejects executable expressions', async () => {
    await expect(runTool('calculate', { expression: 'import("fs")' })).rejects.toThrow('não permitidos');
  });

  it('returns useful system information', async () => {
    const info = JSON.parse(await runTool('system_info', {}));
    expect(info.cores).toBeGreaterThan(0);
    expect(info.totalMemoryGb).toBeGreaterThan(0);
  });
});
