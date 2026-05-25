import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('PlannerTargetsSectionComponent template', () => {
  it('uses a distinct empty fuel placeholder and a form-like power target layout', () => {
    const template = readSiblingFile('planner-targets-section.component.html');
    const styles = readSiblingFile('planner-workbench-sections.css');

    expect(template).toContain('<option value="">Choose fuel source</option>');
    expect(template).not.toContain('<option value="">Fuel</option>');
    expect(template).toContain('class="power-target-list" role="list"');
    expect(template).toContain('class="power-target-fields"');
    expect(template).toContain('class="power-target-field__label">Generator</span>');
    expect(template).not.toContain('power-target-cell--summary');
    expect(styles).toContain("'drag fields actions'");
    expect(styles).toContain("'drag summary actions'");
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });
});

function readSiblingFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), 'utf8');
}
