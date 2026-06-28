import { pwa } from "./configs/pwa";
import { i18n } from "./configs/i18n";

const appBaseURL = "/oh-my-cv/";
const siteUrl = "https://zeevenn.github.io";
const publicSiteUrl = `${siteUrl}${appBaseURL}`;
const isProductionBuild = process.argv.some((arg) => ["build", "generate"].includes(arg));
const buildDir =
  process.env.NUXT_BUILD_DIR || (isProductionBuild ? ".cache/nuxt-build" : ".nuxt");
const withBase = (path: string) =>
  `${appBaseURL}${path.replace(/^\//, "")}`.replace(/^\/\//, "/");

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  srcDir: "src/",
  buildDir,

  modules: [
    "@vueuse/nuxt",
    "@unocss/nuxt",
    "@pinia/nuxt",
    "@nuxtjs/i18n",
    "@nuxtjs/color-mode",
    "@vite-pwa/nuxt",
    "nuxt-simple-sitemap",
    "radix-vue/nuxt",
    "shadcn-nuxt"
  ],

  css: [
    "@unocss/reset/tailwind.css",
    "katex/dist/katex.min.css",
    "~/assets/css/index.css"
  ],

  i18n,

  shadcn: {
    prefix: "Ui",
    componentDir: "./src/components/ui"
  },

  runtimeConfig: {
    public: {
      googleFontsKey: "",
      githubOauthClientId: "",
      githubOauthProxyBase: ""
    }
  },

  colorMode: {
    preference: "system",
    fallback: "light",
    classSuffix: ""
  },

  app: {
    baseURL: appBaseURL,
    head: {
      viewport: "width=device-width,initial-scale=1",
      link: [
        { rel: "apple-touch-icon", href: withBase("apple-touch-icon.png") },
        { rel: "mask-icon", href: withBase("safari-pinned-tab.svg"), color: "#222" }
      ],
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "color-scheme", content: "light dark" },
        { name: "application-name", content: "Oh My CV!" },
        { name: "apple-mobile-web-app-title", content: "Oh My CV!" },
        { name: "msapplication-TileColor", content: "#fff" },
        { property: "og:url", content: publicSiteUrl },
        { property: "og:type", content: "website" }
      ]
    }
  },

  site: {
    url: siteUrl
  },

  pwa,
  compatibilityDate: "2026-06-24"
});
