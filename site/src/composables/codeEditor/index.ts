import {
  history,
  defaultKeymap,
  historyKeymap,
  indentWithTab
} from "@codemirror/commands";
import { catppuccinLatte, catppuccinMocha } from "@catppuccin/codemirror";
import { flavors } from "@catppuccin/palette";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentOnInput
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
import { isClient } from "@renovamen/utils";

export type CodeEditorModel = "markdown" | "css";

type CodeEditorRuntime = {
  view: EditorView;
  language: Compartment;
  theme: Compartment;
  stopThemeWatch: () => void;
};

const documents: Record<CodeEditorModel, string> = {
  markdown: "",
  css: ""
};

let runtime: CodeEditorRuntime | undefined;
let activeModel: CodeEditorModel = "markdown";

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

const catppuccinTheme = (dark: boolean): Extension =>
  dark ? catppuccinMocha : catppuccinLatte;

const getPalette = (dark: boolean) => (dark ? flavors.mocha : flavors.latte).colors;

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

const editorOverrides = (dark: boolean) => {
  const palette = getPalette(dark);
  const selectionOverrides: Parameters<typeof EditorView.theme>[0] = dark
    ? {
        ".cm-selectionBackground, .cm-content ::selection": {
          backgroundColor: palette.surface1.hex
        },
        "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
          backgroundColor: palette.surface1.hex
        }
      }
    : {};

  return EditorView.theme(
    {
      "&": {
        height: "100%"
      },
      "&.cm-focused": {
        outline: "none"
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: "13px",
        lineHeight: "1.5",
        touchAction: "pan-y"
      },
      ".cm-content": {
        minHeight: "100%",
        padding: "0.75rem 0"
      },
      ".cm-line": {
        padding: "0 0.75rem"
      },
      ...selectionOverrides,
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
        color: palette.overlay1.hex,
        cursor: "pointer",
        verticalAlign: "middle",
        transition: "color 160ms ease, background-color 160ms ease"
      },
      ".cm-foldMarker:hover": {
        color: palette.blue.hex,
        backgroundColor: palette.surface0.hex
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
        border: `1px solid ${palette.surface1.hex}`,
        borderRadius: "6px",
        color: palette.subtext0.hex,
        backgroundColor: palette.surface0.hex,
        font: "inherit",
        fontSize: "0.85em",
        lineHeight: "1.35",
        cursor: "pointer",
        verticalAlign: "baseline"
      },
      ".cm-foldPlaceholder:hover": {
        color: palette.blue.hex,
        borderColor: palette.surface2.hex,
        backgroundColor: palette.surface1.hex
      },
      "@media (max-width: 768px)": {
        ".cm-scroller": {
          fontSize: "14px"
        },
        ".cm-content": {
          padding: "0.75rem 0"
        }
      }
    },
    { dark }
  );
};

// Earlier CodeMirror theme extensions have higher CSS precedence.
const themeExtensions = (dark: boolean): Extension => [
  editorOverrides(dark),
  catppuccinTheme(dark)
];

const foldPlaceholderConfig = codeFolding({
  preparePlaceholder: (state, range): FoldPlaceholder => ({
    lines: state.doc.lineAt(range.to).number - state.doc.lineAt(range.from).number
  }),
  placeholderDOM: createFoldPlaceholder
});

const editorExtensions = (
  language: Compartment,
  theme: Compartment,
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
  theme.of(themeExtensions(dark)),
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

      const view = new EditorView({
        parent: container,
        state: EditorState.create({
          doc: documents[activeModel],
          extensions: editorExtensions(language, theme, isDark)
        })
      });

      const stopThemeWatch = watch(
        () => colorMode.value,
        (value) => {
          const dark = value === "dark";

          view.dispatch({
            effects: theme.reconfigure(themeExtensions(dark))
          });
        }
      );

      runtime = { view, language, theme, stopThemeWatch };
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
