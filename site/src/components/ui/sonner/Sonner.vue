<script lang="ts" setup>
import { Toaster as Sonner, type ToasterProps } from "vue-sonner";

const props = withDefaults(defineProps<ToasterProps>(), {
  position: "top-center",
  theme: "system",
  visibleToasts: 1,
  duration: 3000,
  gap: 8,
  offset: "0.75rem",
  closeButton: false,
  containerAriaLabel: "Notifications"
});
</script>

<template>
  <Sonner
    class="toaster group"
    v-bind="props"
    :toast-options="{
      classes: {
        toast:
          'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-lg group-[.toaster]:border-border',
        title: 'group-[.toast]:text-sm group-[.toast]:font-medium',
        description: 'group-[.toast]:text-muted-foreground',
        actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
        cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        closeButton:
          'group-[.toast]:bg-background group-[.toast]:text-muted-foreground group-[.toaster]:border-border hover:(bg-background! text-foreground! border-foreground!)',
        error: 'group-[.toaster]:text-destructive group-[.toaster]:border-destructive',
        success: 'group-[.toaster]:text-success group-[.toaster]:border-success',
        info: 'group-[.toaster]:text-info group-[.toaster]:border-info'
      }
    }"
  />
</template>
