import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('PlannerTargetsSectionComponent template', () => {
  it('uses a distinct empty fuel placeholder and lets power summaries wrap wider', () => {
    const template = readSiblingFile('planner-targets-section.component.html');
    const styles = readSiblingFile('planner-workbench-sections.css');

    expect(template).toContain('<option value="">Choose fuel source</option>');
    expect(template).not.toContain('<option value="">Fuel</option>');
    expect(template).toContain('class="power-target-summary power-target-cell--summary"');
    expect(styles).toContain("'drag generator fuel mode amount actions'");
    expect(styles).toContain("'drag summary summary summary summary actions'");
  });
});

function readSiblingFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), 'utf8');
}
