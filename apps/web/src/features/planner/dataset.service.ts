import { Injectable, signal } from '@angular/core';
import { type GameDataset, gameDatasetSchema, tinySatisfactoryDataset } from '@beltwise/game-data';

const DATASET_URLS = ['/data/satisfactory-current.json', '/data/generated/satisfactory-current.json'];

@Injectable({ providedIn: 'root' })
export class DatasetService {
  public readonly dataset = signal<GameDataset | null>(null);
  public readonly loadError = signal<string | null>(null);

  public constructor() {
    void this.loadDataset();
  }

  private async loadDataset(): Promise<void> {
    const errors: string[] = [];

    for (const datasetUrl of DATASET_URLS) {
      try {
        const response = await fetch(datasetUrl);
        if (!response.ok) {
          throw new Error(`Dataset request failed with ${response.status}`);
        }
        const parsed = gameDatasetSchema.parse((await response.json()) as unknown);
        this.dataset.set(parsed);
        this.loadError.set(null);
        return;
      } catch (error: unknown) {
        errors.push(`${datasetUrl}: ${error instanceof Error ? error.message : 'Dataset load failed'}`);
      }
    }

    try {
      this.dataset.set(tinySatisfactoryDataset);
      this.loadError.set(null);
      console.warn(`Using fixture planner data. ${errors.join(' ')}`);
    } catch (error: unknown) {
      this.loadError.set(error instanceof Error ? error.message : 'Dataset load failed');
    }
  }
}
