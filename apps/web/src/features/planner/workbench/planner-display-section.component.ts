import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  ConveyorBeltTier,
  GraphEdgeStyle,
  PipelineTier,
  RateDecimalPlaces,
} from '@beltwise/planner-core';
import { PlannerStoreService } from '../state/planner-store.service';

interface BeltTierOption {
  value: ConveyorBeltTier;
  label: string;
  capacityLabel: string;
}

interface PipeTierOption {
  value: PipelineTier;
  label: string;
  capacityLabel: string;
}

interface RateDecimalOption {
  value: RateDecimalPlaces;
  label: string;
}

interface EdgeStyleOption {
  value: GraphEdgeStyle;
  label: string;
}

@Component({
  selector: 'bw-planner-display-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './planner-display-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerDisplaySectionComponent {
  public readonly store = inject(PlannerStoreService);
  public readonly beltTierOptions: readonly BeltTierOption[] = [
    { value: 1, label: 'Mk.1', capacityLabel: '60/min' },
    { value: 2, label: 'Mk.2', capacityLabel: '120/min' },
    { value: 3, label: 'Mk.3', capacityLabel: '270/min' },
    { value: 4, label: 'Mk.4', capacityLabel: '480/min' },
    { value: 5, label: 'Mk.5', capacityLabel: '780/min' },
    { value: 6, label: 'Mk.6', capacityLabel: '1200/min' },
  ];
  public readonly pipeTierOptions: readonly PipeTierOption[] = [
    { value: 1, label: 'Mk.1', capacityLabel: '300/min' },
    { value: 2, label: 'Mk.2', capacityLabel: '600/min' },
  ];
  public readonly rateDecimalOptions: readonly RateDecimalOption[] = [
    { value: 1, label: '1 decimal' },
    { value: 2, label: '2 decimals' },
    { value: 3, label: '3 decimals' },
    { value: 4, label: '4 decimals' },
  ];
  public readonly edgeStyleOptions: readonly EdgeStyleOption[] = [
    { value: 'straight', label: 'Straight lines' },
    { value: 'curved', label: 'Curved lines' },
  ];
}
