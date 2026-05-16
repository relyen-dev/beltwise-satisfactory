import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameIconComponent } from './game-icon.component';
import { PlannerStoreService } from './planner-store.service';

@Component({
  selector: 'bw-planner-recipes-section',
  standalone: true,
  imports: [CommonModule, FormsModule, GameIconComponent],
  templateUrl: './planner-recipes-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerRecipesSectionComponent {
  public readonly store = inject(PlannerStoreService);
}
