<template>
  <div id="editor-page" class="flex flex-col">
    <SharedHeader>
      <template #tail>
        <UiButton
          class="lt-lg:hidden"
          variant="ghost-secondary"
          size="round"
          @click="isToolbarOpen = !isToolbarOpen"
          :aria-label="isToolbarOpen ? $t('close_toolbar') : $t('open_toolbar')"
        >
          <span
            :class="[
              'size-4.5',
              isToolbarOpen
                ? 'i-tabler:layout-sidebar-right-collapse'
                : 'i-tabler:layout-sidebar-right-expand'
            ]"
          />
        </UiButton>
      </template>
    </SharedHeader>

    <div class="workspace editor-workspace flex pb-2" :data-mobile-panel="mobilePanel">
      <SplitterGroup id="splitter-editor" direction="horizontal" class="px-3">
        <SplitterPanel id="code-pane">
          <EditorCode v-if="data.loaded" />
          <div v-else class="flex flex-col gap-y-2 h-full">
            <UiSkeleton class="h-10 bg-secondary" />
            <UiSkeleton class="flex-1 bg-secondary" />
          </div>
        </SplitterPanel>

        <SplitterResizeHandle
          id="code-preview-handle"
          class="w-3 relative after:(content-[''] absolute bg-border w-1 h-10 rounded-full inset-0 m-auto)"
        />

        <SplitterPanel id="preview-pane">
          <EditorPreview v-if="data.loaded" />
          <UiSkeleton v-else class="size-full bg-secondary" />
        </SplitterPanel>
      </SplitterGroup>

      <div v-if="isToolbarVisible" id="tools-pane" class="editor-tools-pane">
        <EditorToolbar v-if="data.loaded" />
        <UiSkeleton v-else class="h-full w-full bg-secondary" lg="w-62 mr-10" />
      </div>

      <nav class="mobile-editor-nav lg:hidden" :aria-label="$t('editor.mobile_nav')">
        <button
          v-for="panel in mobilePanels"
          :key="panel.id"
          type="button"
          :aria-current="mobilePanel === panel.id ? 'page' : undefined"
          @click="mobilePanel = panel.id"
        >
          <span :class="[panel.icon, 'size-4.5']" />
          <span>{{ $t(panel.label) }}</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { isInteger } from "@renovamen/utils";

const route = useRoute();
const { data } = useDataStore();
const { startAutosave } = useResumeAutosave();

type MobilePanel = "code" | "preview" | "tools";

const LG_MIN_WIDTH = 1025;
const mobilePanel = ref<MobilePanel>("code");
const mobilePanels: { id: MobilePanel; icon: string; label: string }[] = [
  { id: "code", icon: "i-lucide:file-pen-line", label: "editor.code" },
  { id: "preview", icon: "i-lucide:scan-eye", label: "editor.preview" },
  { id: "tools", icon: "i-lucide:sliders-horizontal", label: "editor.tools" }
];

// Fetch resume data
onMounted(() => {
  if (isInteger(route.params.id, { allowString: true })) {
    storageService.switchToResume(Number(route.params.id));
  }
});

startAutosave();

// Toggle toolbar
const { width } = useWindowSize({ initialWidth: LG_MIN_WIDTH });
const isDesktop = computed(() => width.value >= LG_MIN_WIDTH);
const isToolbarOpen = ref(true);
const isToolbarVisible = computed(() =>
  isDesktop.value ? isToolbarOpen.value : mobilePanel.value === "tools"
);

watch(
  isDesktop,
  (desktop) => {
    isToolbarOpen.value = desktop;
    if (desktop) mobilePanel.value = "code";
  },
  { immediate: true }
);
</script>
