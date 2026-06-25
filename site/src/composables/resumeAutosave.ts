import { onBeforeUnmount, toRaw, watch } from "vue";
import { useDataStore } from "./stores/data";
import { useStyleStore } from "./stores/style";
import { storageService } from "~/utils/storage";

const AUTOSAVE_DELAY_MS = 10_000;

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let hasPendingAutosave = false;

const clearAutosaveTimer = () => {
  if (!autosaveTimer) return;

  clearTimeout(autosaveTimer);
  autosaveTimer = null;
};

export const useResumeAutosave = () => {
  const { data } = useDataStore();
  const { styles } = useStyleStore();

  const saveCurrentResume = async (options: { notify?: boolean } = {}) => {
    if (!data.loaded || !data.resumeId) return;

    clearAutosaveTimer();
    hasPendingAutosave = false;

    await storageService.updateResume(
      {
        id: data.resumeId,
        name: data.resumeName,
        markdown: data.markdown,
        css: data.css,
        styles: toRaw(styles)
      },
      true,
      { silent: !options.notify }
    );
  };

  const scheduleAutosave = () => {
    if (!import.meta.client) return;
    if (!data.loaded || !data.resumeId) return;

    clearAutosaveTimer();
    hasPendingAutosave = true;

    autosaveTimer = setTimeout(() => {
      void saveCurrentResume();
    }, AUTOSAVE_DELAY_MS);
  };

  const flushAutosave = () => {
    if (!import.meta.client) return;
    if (!hasPendingAutosave) return;

    void saveCurrentResume();
  };

  const startAutosave = () => {
    if (!import.meta.client) return;

    const stop = watch(
      [
        () => data.resumeId,
        () => data.resumeName,
        () => data.markdown,
        () => data.css,
        styles
      ],
      scheduleAutosave,
      { deep: true }
    );

    onBeforeUnmount(() => {
      stop();
      flushAutosave();
    });
  };

  return {
    saveCurrentResume,
    startAutosave
  };
};
