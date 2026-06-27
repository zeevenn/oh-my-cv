import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetUno,
  presetWebFonts,
  transformerDirectives,
  transformerVariantGroup
} from "unocss";
import { i18n } from "./configs/i18n";
import presetAnimations from "unocss-preset-animations";
import { presetShadcn } from "unocss-preset-shadcn";

export default defineConfig({
  shortcuts: [
    {
      "flex-center": "flex items-center justify-center",
      hstack: "flex items-center",
      "hide-on-mobile": "lt-md:hidden",
      "ring-when-focus":
        "ring-offset-background focus-visible:(outline-none ring-2 ring-ring ring-offset-2)",
      "shadow-c": "shadow shadow-[hsl(var(--border))]",
      "resume-card":
        "relative mx-auto rounded-md duration-150 hover:(-translate-y-3 drop-shadow-xl)"
    }
  ],
  preflights: [
    {
      getCSS: () => `
        :root {
          --success: 109 58% 40%;
          --info: 220 91% 54%;
        }

        .dark {
          --success: 115 54% 76%;
          --info: 217 92% 76%;
        }
      `
    }
  ],
  theme: {
    breakpoints: {
      sm: "641px",
      md: "769px",
      lg: "1025px"
    },
    colors: {
      success: "hsl(var(--success))",
      info: "hsl(var(--info))"
    }
  },
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      extraProperties: {
        display: "inline-block"
      }
    }),
    presetWebFonts({
      fonts: {
        ui: "Lato:400,700"
      }
    }),
    presetAnimations(),
    presetShadcn(
      {
        color: {
          base: "blue",
          light: {
            background: "220 23% 95%",
            foreground: "234 16% 35%",
            card: "220 23% 95%",
            "card-foreground": "234 16% 35%",
            popover: "220 23% 95%",
            "popover-foreground": "234 16% 35%",
            primary: "220 91% 54%",
            "primary-foreground": "220 23% 95%",
            secondary: "223 16% 83%",
            "secondary-foreground": "234 16% 35%",
            muted: "220 22% 92%",
            "muted-foreground": "233 10% 47%",
            accent: "220 22% 92%",
            "accent-foreground": "234 16% 35%",
            destructive: "347 87% 44%",
            "destructive-foreground": "220 23% 95%",
            border: "225 14% 77%",
            input: "225 14% 77%",
            ring: "220 91% 54%"
          },
          dark: {
            background: "240 21% 15%",
            foreground: "226 64% 88%",
            card: "240 21% 15%",
            "card-foreground": "226 64% 88%",
            popover: "240 21% 15%",
            "popover-foreground": "226 64% 88%",
            primary: "217 92% 76%",
            "primary-foreground": "240 23% 9%",
            secondary: "237 16% 23%",
            "secondary-foreground": "226 64% 88%",
            muted: "237 16% 23%",
            "muted-foreground": "228 24% 72%",
            accent: "237 16% 23%",
            "accent-foreground": "226 64% 88%",
            destructive: "343 81% 75%",
            "destructive-foreground": "240 23% 9%",
            border: "234 13% 31%",
            input: "234 13% 31%",
            ring: "217 92% 76%"
          }
        }
      },
      false
    )
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  content: {
    pipeline: {
      // https://github.com/fisand/unocss-preset-shadcn
      include: [/\.ts/, /\.vue$/, /\.vue\?vue/]
    }
  },
  // @ts-expect-error icon is a customized key
  safelist: i18n.locales.map((item) => item.icon)
});
