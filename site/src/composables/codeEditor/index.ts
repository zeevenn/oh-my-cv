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
  stopThemeWatch: () => void;
};

const documents: Record<CodeEditorModel, string> = {
  markdown: "",
  css: ""
};

let runtime: CodeEditorRuntime | undefined;
let activeModel: CodeEditorModel = "markdown";

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

const catppuccinMochaHighlight = HighlightStyle.define([
  { tag: t.comment, color: mocha.overlay1, fontStyle: "italic" },
  {
    tag: [
      t.keyword,
      t.modifier,
      t.operatorKeyword,
      t.controlKeyword,
      t.definitionKeyword,
      t.moduleKeyword
    ],
    color: mocha.mauve
  },
  { tag: [t.atom, t.bool, t.null, t.number, t.unit], color: mocha.peach },
  { tag: [t.string, t.docString, t.character, t.attributeValue], color: mocha.green },
  { tag: [t.escape, t.regexp, t.color, t.url], color: mocha.pink },
  { tag: [t.name, t.variableName], color: mocha.text },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
    color: mocha.blue
  },
  {
    tag: [t.definition(t.name), t.definition(t.variableName), t.className],
    color: mocha.yellow
  },
  { tag: [t.typeName, t.namespace, t.tagName], color: mocha.yellow },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: mocha.lavender },
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
    color: mocha.sky
  },
  { tag: [t.punctuation, t.separator, t.bracket], color: mocha.overlay2 },
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
    color: mocha.mauve,
    fontWeight: "700"
  },
  { tag: t.strong, color: mocha.maroon, fontWeight: "700" },
  { tag: t.emphasis, color: mocha.maroon, fontStyle: "italic" },
  { tag: t.link, color: mocha.blue, textDecoration: "underline" },
  { tag: t.quote, color: mocha.teal, fontStyle: "italic" },
  {
    tag: t.monospace,
    color: mocha.green,
    backgroundColor: mocha.surface0,
    borderRadius: "4px"
  },
  { tag: t.contentSeparator, color: mocha.overlay0 },
  { tag: t.inserted, color: mocha.green },
  { tag: t.deleted, color: mocha.red },
  { tag: t.invalid, color: mocha.red, textDecoration: "underline wavy" }
]);

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

const editorTheme = () =>
  EditorView.theme(
    {
      "&": {
        height: "100%",
        color: mocha.text,
        backgroundColor: mocha.base
      },
      "&.cm-focused": {
        outline: "none"
      },
      ".cm-scroller": {
        overflow: "auto",
        backgroundColor: mocha.base,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: "13px",
        lineHeight: "1.5",
        touchAction: "pan-y"
      },
      ".cm-content": {
        minHeight: "100%",
        padding: "0.75rem 0",
        caretColor: mocha.rosewater
      },
      ".cm-cursor": {
        borderLeftColor: mocha.rosewater
      },
      ".cm-line": {
        padding: "0 0.75rem"
      },
      ".cm-gutters": {
        borderRight: `1px solid ${mocha.surface0}`,
        color: mocha.overlay0,
        backgroundColor: mocha.mantle
      },
      ".cm-activeLine": {
        backgroundColor: "rgb(49 50 68 / 0.55)"
      },
      ".cm-activeLineGutter": {
        color: mocha.lavender,
        backgroundColor: mocha.surface0,
        fontWeight: "600"
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "rgb(137 180 250 / 0.32)"
      },
      ".cm-searchMatch": {
        backgroundColor: "rgb(249 226 175 / 0.22)",
        outline: `1px solid rgb(249 226 175 / 0.45)`
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "rgb(250 179 135 / 0.35)"
      },
      ".cm-matchingBracket": {
        color: mocha.green,
        backgroundColor: mocha.surface0,
        outline: `1px solid ${mocha.surface1}`
      },
      ".cm-nonmatchingBracket": {
        color: mocha.red
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
        color: mocha.overlay1,
        cursor: "pointer",
        verticalAlign: "middle",
        transition: "color 160ms ease, background-color 160ms ease"
      },
      ".cm-foldMarker:hover": {
        color: mocha.blue,
        backgroundColor: mocha.surface0
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
        border: `1px solid ${mocha.surface1}`,
        borderRadius: "6px",
        color: mocha.subtext0,
        backgroundColor: mocha.surface0,
        font: "inherit",
        fontSize: "0.85em",
        lineHeight: "1.35",
        cursor: "pointer",
        verticalAlign: "baseline"
      },
      ".cm-foldPlaceholder:hover": {
        color: mocha.blue,
        borderColor: mocha.surface2,
        backgroundColor: mocha.surface1
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
    { dark: true }
  );

const foldPlaceholderConfig = codeFolding({
  preparePlaceholder: (state, range): FoldPlaceholder => ({
    lines: state.doc.lineAt(range.to).number - state.doc.lineAt(range.from).number
  }),
  placeholderDOM: createFoldPlaceholder
});

const editorExtensions = (language: Compartment, theme: Compartment): Extension[] => [
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
  syntaxHighlighting(catppuccinMochaHighlight, { fallback: true }),
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
  theme.of(editorTheme()),
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

      const stopThemeWatch = () => undefined;

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
