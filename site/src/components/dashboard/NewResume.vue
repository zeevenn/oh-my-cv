<template>
  <UiButton class="gap-x-1.5" @click="newAndSwitch">
    <span i-ic:round-plus size-4 />
    {{ $t("dashboard.new") }}
  </UiButton>
</template>

<script lang="ts" setup>
const router = useRouter();
const localePath = useLocalePath();

const newAndSwitch = async () => {
  const data = await storageService.createResume();

  if (!data) return;
  else router.push(localePath(`/editor/${data.id}`));
};
</script>
