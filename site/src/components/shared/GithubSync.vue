<template>
  <UiDialog>
    <UiTooltipProvider>
      <UiTooltip>
        <UiTooltipTrigger as-child>
          <UiDialogTrigger as-child>
            <UiButton
              variant="ghost-secondary"
              size="round"
              :aria-label="$t('sync.trigger')"
            >
              <span :class="[statusIcon, 'text-lg']" />
            </UiButton>
          </UiDialogTrigger>
        </UiTooltipTrigger>
        <UiTooltipContent>
          {{ $t("sync.trigger") }}
        </UiTooltipContent>
      </UiTooltip>
    </UiTooltipProvider>

    <UiDialogScrollContent class="max-w-md">
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
          <div class="hstack gap-x-3 rounded-md border p-3">
            <img
              v-if="sync.user?.avatarUrl"
              :src="sync.user.avatarUrl"
              :alt="sync.user.login"
              class="size-8 rounded-full"
            />
            <span v-else i-tabler:brand-github class="size-8" />
            <div class="min-w-0">
              <div class="truncate text-sm font-medium">
                {{ $t("sync.connected_as", { user: sync.user?.login }) }}
              </div>
              <a
                v-if="sync.gistUrl"
                :href="sync.gistUrl"
                target="_blank"
                rel="noreferrer noopener"
                class="block truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                {{ sync.gistUrl }}
              </a>
            </div>
          </div>

          <div v-if="sync.lastSyncedAt" text="xs muted-foreground">
            {{ $t("sync.last_synced", { time: formatDate(sync.lastSyncedAt) }) }}
          </div>
        </div>

        <UiDialogFooter class="gap-y-2">
          <UiButton variant="outline" @click="disconnect">
            {{ $t("sync.disconnect") }}
          </UiButton>
          <UiButton :disabled="sync.status === 'syncing'" @click="syncNow">
            <span
              :class="[
                'mr-1.5 size-4',
                sync.status === 'syncing'
                  ? 'i-lucide:refresh-cw animate-spin'
                  : 'i-lucide:refresh-cw'
              ]"
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
            <span
              :class="[
                'mr-1.5 size-4',
                sync.status === 'connecting'
                  ? 'i-lucide:refresh-cw animate-spin'
                  : 'i-tabler:brand-github'
              ]"
            />
            {{ $t("sync.connect") }}
          </UiButton>
        </UiDialogFooter>
      </template>
    </UiDialogScrollContent>
  </UiDialog>
</template>

<script lang="ts" setup>
const { sync } = useSyncStore();

const isConfigured = computed(() => githubSyncService.isConfigured());

const statusIcon = computed(() => {
  if (sync.status === "syncing" || sync.status === "connecting") {
    return "i-lucide:refresh-cw animate-spin";
  }

  if (sync.status === "error") return "i-lucide:cloud-alert";
  if (sync.provider === "github") return "i-lucide:cloud-check";
  return "i-lucide:cloud";
});

const connect = () => githubSyncService.connect();
const syncNow = () => githubSyncService.syncNow();
const disconnect = () => githubSyncService.disconnect();

const copyCode = async () => {
  if (!sync.deviceLogin) return;
  await navigator.clipboard.writeText(sync.deviceLogin.userCode);
};

const formatDate = (date: string) =>
  new Date(Number(date)).toISOString().substring(0, 19).replace("T", " ");
</script>
