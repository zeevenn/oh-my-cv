<template>
  <div class="flex gap-2">
    <UiButton @click="exportToJSON">
      <span i-ic:baseline-save-as size-4 mr-1 />
      {{ $t("dashboard.saveas") }}
    </UiButton>
    <UiButton variant="secondary" @click="open">
      <span i-ic:round-upload-file size-4 mr-1 />
      {{ $t("dashboard.import") }}
    </UiButton>
  </div>
</template>

<script lang="ts" setup>
import { useShortcuts } from "@ohmycv/vue-shortcuts";
import { useFileDialog, readFile } from "@renovamen/utils";

const emits = defineEmits<{
  (e: "update"): void;
}>();

const { open, onChange } = useFileDialog(".json");

onChange(async (file) => {
  const content = await readFile(file);
  await storageService.importFromJson(content);
  emits("update");
});

const exportToJSON = () => storageService.exportToJSON();

useShortcuts("shift+ctrl+s", exportToJSON);
</script>
