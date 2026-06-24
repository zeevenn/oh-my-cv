<template>
  <UiDialog :open="dialogOpen" @update:open="handleDialogOpenChange">
    <UiTooltipProvider :ignore-non-keyboard-focus="true">
      <UiTooltip
        :open="tooltipOpen"
        :disabled="dialogOpen || tooltipSuppressed || !canShowTooltip"
        :ignore-non-keyboard-focus="true"
        @update:open="handleTooltipOpenChange"
      >
        <UiTooltipTrigger as-child>
          <UiDialogTrigger as-child>
            <UiButton
              variant="ghost-secondary"
              size="round"
              :aria-label="$t('sync.trigger')"
            >
              <RefreshCw
                v-if="sync.status === 'syncing' || sync.status === 'connecting'"
                class="size-[18px] animate-spin"
              />
              <CircleAlert v-else-if="sync.status === 'error'" class="size-[18px]" />
              <BadgeCheck v-else-if="sync.provider === 'github'" class="size-[18px]" />
              <Cloud v-else class="size-[18px]" />
            </UiButton>
          </UiDialogTrigger>
        </UiTooltipTrigger>
        <UiTooltipContent>
          {{ $t("sync.trigger") }}
        </UiTooltipContent>
      </UiTooltip>
    </UiTooltipProvider>

    <UiDialogScrollContent class="w-[calc(100vw-2rem)] max-w-xl">
      <UiDialogHeader>
        <UiDialogTitle>{{ $t("sync.title") }}</UiDialogTitle>
        <UiDialogDescription>{{ $t("sync.desc") }}</UiDialogDescription>
      </UiDialogHeader>

      <UiAlert v-if="sync.error" variant="destructive">
        <span i-lucide:circle-alert />
        <UiAlertTitle>{{ $t("sync.error") }}</UiAlertTitle>
        <UiAlertDescription>{{ sync.error }}</UiAlertDescription>
      </UiAlert>

      <UiAlert v-if="!isConfigured" variant="destructive">
        <span i-lucide:settings />
        <UiAlertTitle>{{ $t("sync.not_configured.title") }}</UiAlertTitle>
        <UiAlertDescription>
          {{ $t("sync.not_configured.desc") }}
        </UiAlertDescription>
      </UiAlert>

      <template v-if="sync.status === 'waiting' && sync.deviceLogin">
        <div class="space-y-3">
          <div class="rounded-md border bg-secondary/40 p-4 text-center">
            <div text="xs muted-foreground">{{ $t("sync.device_code") }}</div>
            <div class="mt-1 font-mono text-2xl font-bold tracking-widest">
              {{ sync.deviceLogin.userCode }}
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <UiButton variant="outline" @click="copyCode">
              <span i-lucide:copy class="mr-1.5 size-4" />
              {{ $t("sync.copy_code") }}
            </UiButton>
            <UiButton as="a" :href="sync.deviceLogin.verificationUri" target="_blank">
              <span i-tabler:brand-github class="mr-1.5 size-4" />
              {{ $t("sync.open_github") }}
            </UiButton>
          </div>
        </div>
      </template>

      <template v-else-if="sync.provider === 'github'">
        <div class="space-y-3">
          <div class="flex min-w-0 items-center gap-3 rounded-md border p-3">
            <img
              v-if="sync.user?.avatarUrl"
              :src="sync.user.avatarUrl"
              :alt="sync.user.login"
              class="size-9 shrink-0 rounded-full"
            />
            <span v-else i-tabler:brand-github class="size-9 shrink-0" />
            <div class="min-w-0 flex-1 overflow-hidden">
              <div class="truncate text-sm font-medium">
                {{ $t("sync.connected_as", { user: sync.user?.login }) }}
              </div>
              <a
                v-if="sync.gistUrl"
                :href="sync.gistUrl"
                :title="sync.gistUrl"
                target="_blank"
                rel="noreferrer noopener"
                class="block max-w-full truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                {{ sync.gistUrl }}
              </a>
            </div>
          </div>

          <div v-if="sync.lastSyncedAt" text="xs muted-foreground">
            {{ $t("sync.last_synced", { time: formatDate(sync.lastSyncedAt) }) }}
          </div>
        </div>

        <UiDialogFooter class="gap-y-2 sm:gap-x-2">
          <UiButton class="w-full sm:w-auto" variant="outline" @click="disconnect">
            {{ $t("sync.disconnect") }}
          </UiButton>
          <UiButton
            class="w-full sm:w-auto"
            :disabled="sync.status === 'syncing'"
            @click="syncNow"
          >
            <RefreshCw
              :class="['mr-1.5 size-4', sync.status === 'syncing' && 'animate-spin']"
            />
            {{ $t("sync.sync_now") }}
          </UiButton>
        </UiDialogFooter>
      </template>

      <template v-else>
        <UiAlert variant="info">
          <span i-lucide:info />
          <UiAlertTitle>{{ $t("sync.privacy.title") }}</UiAlertTitle>
          <UiAlertDescription>{{ $t("sync.privacy.desc") }}</UiAlertDescription>
        </UiAlert>

        <UiDialogFooter>
          <UiButton
            :disabled="!isConfigured || sync.status === 'connecting'"
            @click="connect"
          >
            <RefreshCw
              v-if="sync.status === 'connecting'"
              class="mr-1.5 size-4 animate-spin"
            />
            <span v-else i-tabler:brand-github class="mr-1.5 size-4" />
            {{ $t("sync.connect") }}
          </UiButton>
        </UiDialogFooter>
      </template>
    </UiDialogScrollContent>
  </UiDialog>
</template>

<script lang="ts" setup>
import { BadgeCheck, CircleAlert, Cloud, RefreshCw } from "lucide-vue-next";

const { sync } = useSyncStore();

const dialogOpen = ref(false);
const tooltipOpen = ref(false);
const tooltipSuppressed = ref(false);
const canShowTooltip = useMediaQuery("(hover: hover) and (pointer: fine)");
let tooltipSuppressTimer: ReturnType<typeof window.setTimeout> | null = null;

const isConfigured = computed(() => githubSyncService.isConfigured());

const suppressTooltip = () => {
  tooltipOpen.value = false;
  tooltipSuppressed.value = true;

  if (tooltipSuppressTimer) window.clearTimeout(tooltipSuppressTimer);

  tooltipSuppressTimer = window.setTimeout(() => {
    tooltipSuppressed.value = false;
    tooltipSuppressTimer = null;
  }, 1500);
};

const handleDialogOpenChange = (open: boolean) => {
  dialogOpen.value = open;
  suppressTooltip();
};

const handleTooltipOpenChange = (open: boolean) => {
  tooltipOpen.value =
    open && canShowTooltip.value && !dialogOpen.value && !tooltipSuppressed.value;
};

const connect = () => githubSyncService.connect();
const syncNow = () => githubSyncService.syncNow();
const disconnect = () => githubSyncService.disconnect();

const copyCode = async () => {
  if (!sync.deviceLogin) return;
  await navigator.clipboard.writeText(sync.deviceLogin.userCode);
};

const padDatePart = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: string) => {
  const value = new Date(Number(date));

  return [
    `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}`,
    `${padDatePart(value.getHours())}:${padDatePart(value.getMinutes())}:${padDatePart(value.getSeconds())}`
  ].join(" ");
};

onBeforeUnmount(() => {
  if (tooltipSuppressTimer) window.clearTimeout(tooltipSuppressTimer);
});
</script>
