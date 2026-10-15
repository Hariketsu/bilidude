import { BookText, List, TextQuote, type LucideIcon } from 'lucide-react';
import type { PresetId } from './types';

/** Labels live in the locale files under `presets.<id>`. */
export const PRESETS: { id: PresetId; icon: LucideIcon }[] = [
  { id: 'recap', icon: List },
  { id: 'toc', icon: BookText },
  { id: 'quotes', icon: TextQuote },
];

export function getPreset(id: PresetId) {
  return PRESETS.find((preset) => preset.id === id)!;
}
