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
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
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

const languageExtension = (model: CodeEditorModel) =>
  model === "markdown" ? markdown() : css();

const editorTheme = (dark: boolean) =>
  EditorView.theme(
    {
      "&": {
        height: "100%",
        color: "hsl(var(--foreground))",
        backgroundColor: "hsl(var(--background))"
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
        padding: "0.75rem 0",
        caretColor: "hsl(var(--foreground))"
      },
      ".cm-line": {
        padding: "0 0.75rem"
      },
      ".cm-gutters": {
        borderRight: "1px solid hsl(var(--border))",
        color: "hsl(var(--muted-foreground))",
        backgroundColor: "hsl(var(--background))"
      },
      ".cm-activeLine, .cm-activeLineGutter": {
        backgroundColor: "hsl(var(--accent))"
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: dark ? "hsl(var(--primary) / 0.35)" : "hsl(var(--primary) / 0.2)"
      },
      ".cm-searchMatch": {
        backgroundColor: "hsl(var(--primary) / 0.18)",
        outline: "1px solid hsl(var(--primary) / 0.45)"
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

const editorExtensions = (language: Compartment, theme: Compartment): Extension[] => [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
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
  theme.of(editorTheme(useColorMode().value === "dark")),
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

      documents.markdown = data.markdown;
      documents.css = data.css;
      activeModel = "markdown";

      const language = new Compartment();
      const theme = new Compartment();

      const view = new EditorView({
        parent: container,
        state: EditorState.create({
          doc: documents[activeModel],
          extensions: editorExtensions(language, theme)
        })
      });

      const stopThemeWatch = watch(
        () => colorMode.value,
        (value) => {
          view.dispatch({
            effects: theme.reconfigure(editorTheme(value === "dark"))
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
