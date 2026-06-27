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
        "relative mx-auto rounded-md duration-150 hover:(-translate-y-1 drop-shadow-md)"
    }
  ],
  preflights: [
    {
      getCSS: () => `
        :root {
          --success: 161 94% 30%;
          --info: 221 83% 53%;
        }

        .dark {
          --success: 158 64% 52%;
          --info: 213 94% 68%;
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
          base: "slate",
          light: {
            background: "210 40% 98%",
            foreground: "222 47% 11%",
            card: "0 0% 100%",
            "card-foreground": "222 47% 11%",
            popover: "0 0% 100%",
            "popover-foreground": "222 47% 11%",
            primary: "214 52% 25%",
            "primary-foreground": "0 0% 100%",
            secondary: "213 24% 93%",
            "secondary-foreground": "222 47% 11%",
            muted: "210 40% 96%",
            "muted-foreground": "215 16% 47%",
            accent: "213 24% 93%",
            "accent-foreground": "222 47% 11%",
            destructive: "0 72% 51%",
            "destructive-foreground": "0 0% 100%",
            border: "214 32% 91%",
            input: "214 32% 91%",
            ring: "214 52% 25%"
          },
          dark: {
            background: "220 49% 8%",
            foreground: "220 13% 91%",
            card: "221 39% 11%",
            "card-foreground": "220 13% 91%",
            popover: "221 39% 11%",
            "popover-foreground": "220 13% 91%",
            primary: "213 94% 68%",
            "primary-foreground": "229 84% 5%",
            secondary: "217 33% 17%",
            "secondary-foreground": "220 13% 91%",
            muted: "217 33% 17%",
            "muted-foreground": "213 27% 84%",
            accent: "217 33% 17%",
            "accent-foreground": "210 40% 98%",
            destructive: "0 91% 71%",
            "destructive-foreground": "229 84% 5%",
            border: "215 25% 27%",
            input: "215 25% 27%",
            ring: "213 94% 68%"
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
