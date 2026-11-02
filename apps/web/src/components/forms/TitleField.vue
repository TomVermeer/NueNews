<script setup lang="ts">
defineProps<{ id: string }>()

const title = defineModel<string>({ required: true })

/** Fires when the user types in the field, so the form stops suggesting titles. */
const emit = defineEmits<{ edit: [] }>()
</script>

<template>
  <div>
    <label class="field-label" :for="id">Title</label>
    <input :id="id" v-model="title" class="field" maxlength="80" @input="emit('edit')" />
  </div>
</template>
