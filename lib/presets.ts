import { BookText, List, TextQuote, type LucideIcon } from 'lucide-react';
import type { PresetId } from './types';

export const PRESETS: { id: PresetId; label: string; icon: LucideIcon }[] = [
  { id: 'recap', label: 'Recap', icon: List },
  { id: 'toc', label: 'Table of Contents', icon: BookText },
  { id: 'quotes', label: 'Top Quotes', icon: TextQuote },
];

export function getPreset(id: PresetId) {
  return PRESETS.find((preset) => preset.id === id)!;
}
