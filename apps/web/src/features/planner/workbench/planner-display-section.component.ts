import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlannerStoreService } from '../state/planner-store.service';
import {
  GRAPH_DISPLAY_BELT_TIER_OPTIONS,
  GRAPH_DISPLAY_EDGE_STYLE_OPTIONS,
  GRAPH_DISPLAY_PIPE_TIER_OPTIONS,
  GRAPH_DISPLAY_RATE_DECIMAL_OPTIONS,
} from './planner-configuration-surface';

@Component({
  selector: 'bw-planner-display-section',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './planner-display-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerDisplaySectionComponent {
  public readonly store = inject(PlannerStoreService);
  public readonly beltTierOptions = GRAPH_DISPLAY_BELT_TIER_OPTIONS;
  public readonly pipeTierOptions = GRAPH_DISPLAY_PIPE_TIER_OPTIONS;
  public readonly rateDecimalOptions = GRAPH_DISPLAY_RATE_DECIMAL_OPTIONS;
  public readonly edgeStyleOptions = GRAPH_DISPLAY_EDGE_STYLE_OPTIONS;
}
