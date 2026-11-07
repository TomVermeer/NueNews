<script setup lang="ts">
import { ArrowLeftRight, ArrowRight, ExternalLink } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useWidgetMutations } from '../api/queries'
import type { RouteData } from '../api/types'
import { useRouteDirection } from '../composables/useRouteDirection'
import { embedUrl, mapsUrl, routeLeg } from '../lib/routeUrls'
import ErrorMessage from '../components/ErrorMessage.vue'

const props = defineProps<{ data: RouteData; dashboardId: string }>()

const { update } = useWidgetMutations()

/** The direction saved on the widget. With an automatic swap the clock turns it around by day. */
const savedReversed = ref(props.data.reversed)
const saveFailed = ref(false)

// What the server says wins, e.g. after the swap was saved or made in another tab.
watch(
  () => props.data.reversed,
  (value) => {
    savedReversed.value = value
  },
)

const direction = useRouteDirection(() => ({
  reversed: savedReversed.value,
  autoSwapAt: props.data.autoSwapAt,
}))
const leg = computed(() => routeLeg(props.data, direction.reversed.value))

/** Flips the map at once and saves the new direction; the flip is undone when saving fails. */
async function saveSwap() {
  const next = !savedReversed.value
  const { origin, destination, mode } = props.data
  savedReversed.value = next
  saveFailed.value = false
  try {
    await update.mutateAsync({
      dashboardId: props.dashboardId,
      id: props.data.widget.id,
      config: { origin, destination, mode, reversed: next },
    })
  } catch {
    // Shown below the map instead of thrown, so the card keeps working.
    savedReversed.value = !next
    saveFailed.value = true
  }
}

/** With an automatic swap the flip only lasts until the next switch and is not saved. */
async function swap() {
  if (direction.autoSwap.value) direction.flip()
  else await saveSwap()
}
</script>

<template>
  <div class="flex h-full flex-col gap-3">
    <div class="flex items-center gap-2">
      <p
        class="flex min-w-0 flex-1 items-center gap-2 text-sm"
        :title="`${leg.origin} to ${leg.destination}`"
      >
        <span class="truncate" data-testid="route-origin">{{ leg.origin }}</span>
        <ArrowRight class="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span class="sr-only">to</span>
        <span class="truncate" data-testid="route-destination">{{ leg.destination }}</span>
      </p>
      <button
        type="button"
        class="icon-btn shrink-0"
        aria-label="Swap start and destination"
        :disabled="update.isPending.value"
        @click="swap"
      >
        <ArrowLeftRight class="size-4" aria-hidden="true" />
      </button>
    </div>

    <!-- The page is served with Referrer-Policy: no-referrer; Google's key check needs our address. -->
    <iframe
      :src="embedUrl(data.embedKey, leg)"
      :title="`Route from ${leg.origin} to ${leg.destination}`"
      class="min-h-48 w-full flex-1 rounded-lg border border-line [[data-editing]_&]:pointer-events-none"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    ></iframe>

    <ErrorMessage v-if="saveFailed" class="text-xs" role="status">
      Could not save the swap, so the route is back as it was.
    </ErrorMessage>
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-ink-muted">
      <a
        :href="mapsUrl(leg)"
        target="_blank"
        rel="noopener noreferrer"
        class="touch-target inline-flex items-center gap-1.5 hover:text-accent"
        >Open in Google Maps <ExternalLink class="size-3.5" aria-hidden="true"
      /></a>
      <p v-if="data.autoSwapAt">Switches direction at {{ data.autoSwapAt }}</p>
    </div>
  </div>
</template>
