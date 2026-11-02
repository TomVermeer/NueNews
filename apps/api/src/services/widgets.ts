import { and, eq, inArray } from 'drizzle-orm'
import type { z } from 'zod'
import {
  widgetConfigSchemas,
  type CreateWidget,
  type saveLayoutSchema,
  type updateWidgetSchema,
} from '@nuenews/shared'
import type { AppDeps } from '../context'
import { onlyRow } from '../db/query'
import { widgets } from '../db/schema'
import { ApiError } from '../http'
import { refreshSourcesNow } from './refreshNow'
import {
  AVAILABLE_WIDGET_TYPES,
  DEFAULT_SIZE,
  linkWidgetSources,
  nextFreeY,
  sourceRefsFor,
  toWidgetDto,
  type WidgetDto,
  type WidgetRow,
} from './widgetSources'

export type WidgetPatch = z.infer<typeof updateWidgetSchema>
export type SaveLayout = z.infer<typeof saveLayoutSchema>

/**
 * Adds a widget to the dashboard, links its sources and fills it right away so it is not empty
 * on first view. `input` has been validated, so its config already has its defaults.
 */
export async function createWidget(
  deps: AppDeps,
  dashboardId: string,
  input: CreateWidget,
): Promise<WidgetDto> {
  if (!AVAILABLE_WIDGET_TYPES.includes(input.type)) {
    throw new ApiError(
      422,
      'widget_type_unavailable',
      `The "${input.type}" widget is not available yet`,
    )
  }

  const { db } = deps
  const refs = sourceRefsFor(input.type, input.config)
  const now = deps.now()
  const layout = input.layout ?? {
    x: 0,
    y: await nextFreeY(db, dashboardId),
    ...DEFAULT_SIZE[input.type],
  }

  const { widget, newSourceIds } = await db.transaction(async (tx) => {
    const widget = onlyRow(
      await tx
        .insert(widgets)
        .values({
          dashboardId,
          type: input.type,
          title: input.title,
          color: input.color ?? null,
          config: input.config,
          ...layout,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    )
    const { newSourceIds } = await linkWidgetSources(tx, widget.id, refs, now)
    return { widget, newSourceIds }
  })

  // Failures are stored on the source, so a widget is created even when its first fetch fails.
  await refreshSourcesNow(deps, newSourceIds)
  return toWidgetDto(widget)
}

/** Validates a changed config against the widget's stored type (the type cannot change). */
function parseConfig(widget: WidgetRow, config: unknown): Record<string, unknown> {
  const parsed = widgetConfigSchemas[widget.type].safeParse(config)
  if (parsed.success) return parsed.data

  const message = parsed.error.issues
    .map((issue) => `config.${issue.path.join('.')}: ${issue.message}`)
    .join('; ')
  throw new ApiError(400, 'invalid_config', message)
}

/** Changes a widget's title, color or config. A new config relinks its sources. */
export async function updateWidget(
  deps: AppDeps,
  widget: WidgetRow,
  patch: WidgetPatch,
): Promise<WidgetDto> {
  const config = patch.config === undefined ? widget.config : parseConfig(widget, patch.config)
  const refs = patch.config === undefined ? undefined : sourceRefsFor(widget.type, config)
  const now = deps.now()

  const { updated, newSourceIds } = await deps.db.transaction(async (tx) => {
    const updated = onlyRow(
      await tx
        .update(widgets)
        .set({
          title: patch.title ?? widget.title,
          color: patch.color === undefined ? widget.color : patch.color,
          config,
          updatedAt: now,
        })
        .where(eq(widgets.id, widget.id))
        .returning(),
    )
    const linked = refs ? await linkWidgetSources(tx, widget.id, refs, now) : undefined
    return { updated, newSourceIds: linked?.newSourceIds ?? [] }
  })

  await refreshSourcesNow(deps, newSourceIds)
  return toWidgetDto(updated)
}

/**
 * Saves new positions and removes the widgets deleted in edit mode, all at once. Every id must
 * be a widget of this dashboard, or nothing changes.
 */
export async function saveLayout(
  deps: AppDeps,
  dashboardId: string,
  { widgets: positions, removed }: SaveLayout,
): Promise<void> {
  const { db } = deps
  const existing = (
    await db.select({ id: widgets.id }).from(widgets).where(eq(widgets.dashboardId, dashboardId))
  ).map((row) => row.id)
  const unknown = [...positions.map((position) => position.id), ...removed].filter(
    (id) => !existing.includes(id),
  )
  if (unknown.length > 0) {
    throw new ApiError(
      400,
      'unknown_widget',
      `Not widgets of this dashboard: ${unknown.join(', ')}`,
    )
  }

  const now = deps.now()
  const kept = positions.filter((position) => !removed.includes(position.id))
  await db.transaction(async (tx) => {
    if (removed.length > 0) {
      await tx
        .delete(widgets)
        .where(and(eq(widgets.dashboardId, dashboardId), inArray(widgets.id, removed)))
    }
    for (const { id, x, y, w, h } of kept) {
      await tx.update(widgets).set({ x, y, w, h, updatedAt: now }).where(eq(widgets.id, id))
    }
  })
}
