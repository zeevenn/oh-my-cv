<template>
  <div class="font-ui">
    <VitePwaManifest />
    <NuxtPage />
    <UiToaster close-button />
  </div>
</template>

<script setup lang="ts">
const { t, locale } = useI18n();

const colorMode = useColorMode();
const preferredDark = usePreferredDark();
const appBaseURL = useRuntimeConfig().app.baseURL;
const withBase = (path: string) =>
  `${appBaseURL}${path.replace(/^\//, "")}`.replace(/^\/\//, "/");

useHead({
  title: t("head.title"),
  meta: [
    { name: "keywords", content: t("head.keywords") },
    { name: "description", content: t("head.desc") },
    { property: "og:title", content: t("head.title") },
    { property: "og:description", content: t("head.desc") },
    { property: "og:locale", content: locale },
    {
      name: "theme-color",
      content: () => (colorMode.value === "dark" ? "#0b1220" : "#f8fafc")
    }
  ],
  link: [
    {
      rel: "icon",
      type: "image/svg+xml",
      href: () => withBase(preferredDark.value ? "favicon-dark.svg" : "favicon.svg")
    }
  ],
  script: [
    {
      src: "https://code.iconify.design/2/2.2.1/iconify.min.js",
      type: "module",
      tagPosition: "bodyClose"
    }
  ]
});

onMounted(() => {
  githubSyncService.init();
});
</script>
