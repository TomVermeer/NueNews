import type { WidgetColor } from '@nuenews/shared'

export const WIDGET_COLOR_LABELS: Record<WidgetColor, string> = {
  red: 'Red',
  orange: 'Orange',
  amber: 'Amber',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  indigo: 'Indigo',
  purple: 'Purple',
  pink: 'Pink',
}

export const colorLabel = (color: WidgetColor | null) =>
  color ? WIDGET_COLOR_LABELS[color] : 'Default'
