import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import type { CreateWidget } from '@nuenews/shared'
import { api, unwrap } from './client'
import type { DashboardDetail, DashboardSummary, WidgetData, WidgetDto } from './types'

export const keys = {
  dashboards: ['dashboards'] as const,
  dashboard: (id: string) => ['dashboard', id] as const,
  widgetData: (id: string) => ['widget-data', id] as const,
}

/** How often widget data is re-read from the server. The server itself refreshes feeds on its own schedule. */
export const WIDGET_POLL_MS = 5 * 60_000

export function useDashboardsQuery() {
  return useQuery({
    queryKey: keys.dashboards,
    queryFn: async () =>
      (await unwrap<{ dashboards: DashboardSummary[] }>(api.dashboards.$get())).dashboards,
  })
}

export function useDashboardQuery(id: MaybeRefOrGetter<string | undefined>) {
  return useQuery({
    queryKey: computed(() => keys.dashboard(toValue(id) ?? '')),
    queryFn: () =>
      unwrap<DashboardDetail>(api.dashboards[':id'].$get({ param: { id: toValue(id)! } })),
    enabled: computed(() => !!toValue(id)),
  })
}

export function useWidgetDataQuery(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => keys.widgetData(toValue(id))),
    queryFn: () => unwrap<WidgetData>(api.widgets[':id'].data.$get({ param: { id: toValue(id) } })),
    refetchInterval: WIDGET_POLL_MS,
  })
}

export function useDashboardMutations() {
  const client = useQueryClient()
  const refreshList = () => client.invalidateQueries({ queryKey: keys.dashboards })

  return {
    create: useMutation({
      mutationFn: (name: string) =>
        unwrap<DashboardSummary>(api.dashboards.$post({ json: { name } })),
      onSuccess: refreshList,
    }),
    rename: useMutation({
      mutationFn: (vars: { id: string; name: string }) =>
        unwrap<DashboardSummary>(
          api.dashboards[':id'].$patch({ param: { id: vars.id }, json: { name: vars.name } }),
        ),
      onSuccess: refreshList,
    }),
    remove: useMutation({
      mutationFn: (id: string) => unwrap<void>(api.dashboards[':id'].$delete({ param: { id } })),
      onSuccess: refreshList,
    }),
  }
}

export interface LayoutSave {
  dashboardId: string
  widgets: { id: string; x: number; y: number; w: number; h: number }[]
  removed: string[]
}

export function useWidgetMutations() {
  const client = useQueryClient()
  const refreshDashboard = (dashboardId: string) =>
    client.invalidateQueries({ queryKey: keys.dashboard(dashboardId) })

  return {
    saveLayout: useMutation({
      mutationFn: (vars: LayoutSave) =>
        unwrap<DashboardDetail>(
          api.dashboards[':id'].layout.$put({
            param: { id: vars.dashboardId },
            json: { widgets: vars.widgets, removed: vars.removed },
          }),
        ),
      onSuccess: (data, vars) => {
        client.setQueryData(keys.dashboard(vars.dashboardId), data)
        for (const id of vars.removed) client.removeQueries({ queryKey: keys.widgetData(id) })
      },
    }),

    create: useMutation({
      mutationFn: (vars: { dashboardId: string; widget: CreateWidget }) =>
        unwrap<WidgetDto>(
          api.dashboards[':id'].widgets.$post({
            param: { id: vars.dashboardId },
            json: vars.widget,
          }),
        ),
      onSuccess: (_widget, vars) => refreshDashboard(vars.dashboardId),
    }),

    update: useMutation({
      mutationFn: (vars: {
        dashboardId: string
        id: string
        title?: string
        config?: Record<string, unknown>
      }) =>
        unwrap<WidgetDto>(
          api.widgets[':id'].$patch({
            param: { id: vars.id },
            json: { title: vars.title, config: vars.config },
          }),
        ),
      onSuccess: (_widget, vars) => {
        void refreshDashboard(vars.dashboardId)
        void client.invalidateQueries({ queryKey: keys.widgetData(vars.id) })
      },
    }),

    refresh: useMutation({
      mutationFn: (id: string) =>
        unwrap<{ refreshed: number; skipped: number }>(
          api.widgets[':id'].refresh.$post({ param: { id } }),
        ),
      onSuccess: (_result, id) => client.invalidateQueries({ queryKey: keys.widgetData(id) }),
    }),
  }
}

export function useItemStateMutation() {
  return useMutation({
    mutationFn: (vars: { ids: string[]; action: 'seen' | 'read' | 'unread' }) =>
      unwrap<{ updated: number }>(api.items.state.$post({ json: vars })),
  })
}
