import {
  history,
  defaultKeymap,
  historyKeymap,
  indentWithTab
} from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting
} from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { isClient } from "@renovamen/utils";

export type CodeEditorModel = "markdown" | "css";

type CodeEditorRuntime = {
  view: EditorView;
  language: Compartment;
  theme: Compartment;
  highlight: Compartment;
  stopThemeWatch: () => void;
};

const documents: Record<CodeEditorModel, string> = {
  markdown: "",
  css: ""
};

let runtime: CodeEditorRuntime | undefined;
let activeModel: CodeEditorModel = "markdown";

const latte = {
  rosewater: "#dc8a78",
  flamingo: "#dd7878",
  pink: "#ea76cb",
  mauve: "#8839ef",
  red: "#d20f39",
  maroon: "#e64553",
  peach: "#fe640b",
  yellow: "#df8e1d",
  green: "#40a02b",
  teal: "#179299",
  sky: "#04a5e5",
  sapphire: "#209fb5",
  blue: "#1e66f5",
  lavender: "#7287fd",
  text: "#4c4f69",
  subtext1: "#5c5f77",
  subtext0: "#6c6f85",
  overlay2: "#7c7f93",
  overlay1: "#8c8fa1",
  overlay0: "#9ca0b0",
  surface2: "#acb0be",
  surface1: "#bcc0cc",
  surface0: "#ccd0da",
  base: "#eff1f5",
  mantle: "#e6e9ef",
  crust: "#dce0e8"
};

const mocha = {
  rosewater: "#f5e0dc",
  flamingo: "#f2cdcd",
  pink: "#f5c2e7",
  mauve: "#cba6f7",
  red: "#f38ba8",
  maroon: "#eba0ac",
  peach: "#fab387",
  yellow: "#f9e2af",
  green: "#a6e3a1",
  teal: "#94e2d5",
  sky: "#89dceb",
  sapphire: "#74c7ec",
  blue: "#89b4fa",
  lavender: "#b4befe",
  text: "#cdd6f4",
  subtext1: "#bac2de",
  subtext0: "#a6adc8",
  overlay2: "#9399b2",
  overlay1: "#7f849c",
  overlay0: "#6c7086",
  surface2: "#585b70",
  surface1: "#45475a",
  surface0: "#313244",
  base: "#1e1e2e",
  mantle: "#181825",
  crust: "#11111b"
};

type CatppuccinPalette = typeof latte;

type FoldPlaceholder = {
  lines: number;
};

const isFoldPlaceholder = (value: unknown): value is FoldPlaceholder =>
  typeof value === "object" &&
  value !== null &&
  "lines" in value &&
  typeof value.lines === "number";

const languageExtension = (model: CodeEditorModel) =>
  model === "markdown" ? markdown() : css();

const getPalette = (dark: boolean): CatppuccinPalette => (dark ? mocha : latte);

const createCatppuccinHighlight = (palette: CatppuccinPalette) =>
  HighlightStyle.define([
    { tag: t.comment, color: palette.overlay1, fontStyle: "italic" },
    {
      tag: [
        t.keyword,
        t.modifier,
        t.operatorKeyword,
        t.controlKeyword,
        t.definitionKeyword,
        t.moduleKeyword
      ],
      color: palette.mauve
    },
    { tag: [t.atom, t.bool, t.null, t.number, t.unit], color: palette.peach },
    { tag: [t.string, t.docString, t.character, t.attributeValue], color: palette.green },
    { tag: [t.escape, t.regexp, t.color, t.url], color: palette.pink },
    { tag: [t.name, t.variableName], color: palette.text },
    {
      tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
      color: palette.blue
    },
    {
      tag: [t.definition(t.name), t.definition(t.variableName), t.className],
      color: palette.yellow
    },
    { tag: [t.typeName, t.namespace, t.tagName], color: palette.yellow },
    { tag: [t.propertyName, t.attributeName, t.labelName], color: palette.lavender },
    {
      tag: [
        t.operator,
        t.derefOperator,
        t.arithmeticOperator,
        t.logicOperator,
        t.bitwiseOperator,
        t.compareOperator,
        t.updateOperator,
        t.definitionOperator,
        t.typeOperator,
        t.controlOperator
      ],
      color: palette.sky
    },
    { tag: [t.punctuation, t.separator, t.bracket], color: palette.overlay2 },
    {
      tag: [
        t.heading,
        t.heading1,
        t.heading2,
        t.heading3,
        t.heading4,
        t.heading5,
        t.heading6
      ],
      color: palette.mauve,
      fontWeight: "700"
    },
    { tag: t.strong, color: palette.maroon, fontWeight: "700" },
    { tag: t.emphasis, color: palette.maroon, fontStyle: "italic" },
    { tag: t.link, color: palette.blue, textDecoration: "underline" },
    { tag: t.quote, color: palette.teal, fontStyle: "italic" },
    {
      tag: t.monospace,
      color: palette.green,
      backgroundColor: palette.surface0,
      borderRadius: "4px"
    },
    { tag: t.contentSeparator, color: palette.overlay0 },
    { tag: t.inserted, color: palette.green },
    { tag: t.deleted, color: palette.red },
    { tag: t.invalid, color: palette.red, textDecoration: "underline wavy" }
  ]);

const catppuccinHighlights = {
  light: createCatppuccinHighlight(latte),
  dark: createCatppuccinHighlight(mocha)
};

const getHighlight = (dark: boolean) =>
  dark ? catppuccinHighlights.dark : catppuccinHighlights.light;

const syntaxHighlight = (dark: boolean) =>
  syntaxHighlighting(getHighlight(dark), { fallback: true });

const createFoldMarker = (open: boolean) => {
  const marker = document.createElement("span");
  marker.className = open ? "cm-foldMarker is-open" : "cm-foldMarker is-closed";
  marker.setAttribute("aria-hidden", "true");
  return marker;
};

const createFoldPlaceholder = (
  _view: EditorView,
  onclick: (event: Event) => void,
  prepared: unknown
) => {
  const placeholder = document.createElement("button");
  const lines = isFoldPlaceholder(prepared) ? prepared.lines : 0;

  placeholder.type = "button";
  placeholder.className = "cm-foldPlaceholder";
  placeholder.setAttribute("aria-label", `${lines} folded lines`);
  placeholder.textContent = lines > 1 ? `... ${lines}` : "...";
  placeholder.addEventListener("click", onclick);

  return placeholder;
};

const editorTheme = (dark: boolean) => {
  const palette = getPalette(dark);

  return EditorView.theme(
    {
      "&": {
        height: "100%",
        color: palette.text,
        backgroundColor: palette.base
      },
      "&.cm-focused": {
        outline: "none"
      },
      ".cm-scroller": {
        overflow: "auto",
        backgroundColor: palette.base,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: "13px",
        lineHeight: "1.5",
        touchAction: "pan-y"
      },
      ".cm-content": {
        minHeight: "100%",
        padding: "0.75rem 0",
        caretColor: palette.rosewater
      },
      ".cm-cursor": {
        borderLeftColor: palette.rosewater
      },
      ".cm-line": {
        padding: "0 0.75rem"
      },
      ".cm-gutters": {
        borderRight: `1px solid ${palette.surface0}`,
        color: palette.overlay0,
        backgroundColor: palette.mantle
      },
      ".cm-activeLine": {
        backgroundColor: dark ? "rgb(49 50 68 / 0.55)" : "rgb(204 208 218 / 0.38)"
      },
      ".cm-activeLineGutter": {
        color: palette.lavender,
        backgroundColor: palette.surface0,
        fontWeight: "600"
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: dark ? "rgb(137 180 250 / 0.32)" : "rgb(30 102 245 / 0.18)"
      },
      ".cm-searchMatch": {
        backgroundColor: dark ? "rgb(249 226 175 / 0.22)" : "rgb(223 142 29 / 0.18)",
        outline: dark
          ? "1px solid rgb(249 226 175 / 0.45)"
          : "1px solid rgb(223 142 29 / 0.38)"
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: dark ? "rgb(250 179 135 / 0.35)" : "rgb(254 100 11 / 0.24)"
      },
      ".cm-matchingBracket": {
        color: palette.green,
        backgroundColor: palette.surface0,
        outline: `1px solid ${palette.surface1}`
      },
      ".cm-nonmatchingBracket": {
        color: palette.red
      },
      ".cm-foldGutter .cm-gutterElement": {
        width: "1.45rem",
        padding: "0 0.2rem"
      },
      ".cm-foldMarker": {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "1rem",
        height: "1rem",
        borderRadius: "5px",
        color: palette.overlay1,
        cursor: "pointer",
        verticalAlign: "middle",
        transition: "color 160ms ease, background-color 160ms ease"
      },
      ".cm-foldMarker:hover": {
        color: palette.blue,
        backgroundColor: palette.surface0
      },
      ".cm-foldMarker::before": {
        content: '""',
        width: "0.36rem",
        height: "0.36rem",
        borderRight: "1.5px solid currentColor",
        borderBottom: "1.5px solid currentColor",
        transformOrigin: "center",
        transition: "transform 160ms ease"
      },
      ".cm-foldMarker.is-open::before": {
        transform: "rotate(45deg) translate(-1px, -1px)"
      },
      ".cm-foldMarker.is-closed::before": {
        transform: "rotate(-45deg)"
      },
      ".cm-foldPlaceholder": {
        margin: "0 0.1rem",
        padding: "0 0.45rem",
        border: `1px solid ${palette.surface1}`,
        borderRadius: "6px",
        color: palette.subtext0,
        backgroundColor: palette.surface0,
        font: "inherit",
        fontSize: "0.85em",
        lineHeight: "1.35",
        cursor: "pointer",
        verticalAlign: "baseline"
      },
      ".cm-foldPlaceholder:hover": {
        color: palette.blue,
        borderColor: palette.surface2,
        backgroundColor: palette.surface1
      },
      "@media (max-width: 768px)": {
        ".cm-scroller": {
          fontSize: "16px"
        },
        ".cm-content": {
          padding: "0.75rem 0"
        }
      }
    },
    { dark }
  );
};

const foldPlaceholderConfig = codeFolding({
  preparePlaceholder: (state, range): FoldPlaceholder => ({
    lines: state.doc.lineAt(range.to).number - state.doc.lineAt(range.from).number
  }),
  placeholderDOM: createFoldPlaceholder
});

const editorExtensions = (
  language: Compartment,
  theme: Compartment,
  highlight: Compartment,
  dark: boolean
): Extension[] => [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldPlaceholderConfig,
  foldGutter({ markerDOM: createFoldMarker }),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  highlight.of(syntaxHighlight(dark)),
  bracketMatching(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  EditorView.lineWrapping,
  EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;

    documents[activeModel] = update.state.doc.toString();

    const { setData } = useDataStore();
    setData(activeModel, documents[activeModel]);
  }),
  language.of(languageExtension(activeModel)),
  theme.of(editorTheme(dark)),
  keymap.of([
    indentWithTab,
    ...defaultKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...searchKeymap
  ])
];

export const useCodeEditor = () => {
  const loading = useState<boolean>("codeEditorLoading", () => false);

  const setup = async (container?: HTMLElement) => {
    if (!isClient || !container) return;

    loading.value = true;

    try {
      runtime?.stopThemeWatch();
      runtime?.view.destroy();
      runtime = undefined;

      const { data } = useDataStore();
      const colorMode = useColorMode();
      const isDark = colorMode.value === "dark";

      documents.markdown = data.markdown;
      documents.css = data.css;
      activeModel = "markdown";

      const language = new Compartment();
      const theme = new Compartment();
      const highlight = new Compartment();

      const view = new EditorView({
        parent: container,
        state: EditorState.create({
          doc: documents[activeModel],
          extensions: editorExtensions(language, theme, highlight, isDark)
        })
      });

      const stopThemeWatch = watch(
        () => colorMode.value,
        (value) => {
          const dark = value === "dark";

          view.dispatch({
            effects: [
              theme.reconfigure(editorTheme(dark)),
              highlight.reconfigure(syntaxHighlight(dark))
            ]
          });
        }
      );

      runtime = { view, language, theme, highlight, stopThemeWatch };
    } catch (error) {
      // TODO: use toast to show error
      console.error("Failed to initialize the editor: ", error);
    } finally {
      loading.value = false;
    }
  };

  const dispose = () => {
    runtime?.stopThemeWatch();
    runtime?.view.destroy();
    runtime = undefined;
    loading.value = false;
  };

  const activateModel = (model: CodeEditorModel) => {
    activeModel = model;

    runtime?.view.dispatch({
      changes: {
        from: 0,
        to: runtime.view.state.doc.length,
        insert: documents[model]
      },
      effects: runtime.language.reconfigure(languageExtension(model))
    });
  };

  const setContent = (model: CodeEditorModel, content: string) => {
    documents[model] = content;

    if (model !== activeModel || !runtime) return;

    runtime.view.dispatch({
      changes: {
        from: 0,
        to: runtime.view.state.doc.length,
        insert: content
      }
    });
  };

  return {
    setup,
    dispose,
    activateModel,
    setContent,
    loading
  };
};
