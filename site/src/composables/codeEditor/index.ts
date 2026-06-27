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

const catppuccinLatteHighlight = HighlightStyle.define([
  { tag: t.comment, color: latte.overlay1, fontStyle: "italic" },
  {
    tag: [
      t.keyword,
      t.modifier,
      t.operatorKeyword,
      t.controlKeyword,
      t.definitionKeyword,
      t.moduleKeyword
    ],
    color: latte.mauve
  },
  { tag: [t.atom, t.bool, t.null, t.number, t.unit], color: latte.peach },
  { tag: [t.string, t.docString, t.character, t.attributeValue], color: latte.green },
  { tag: [t.escape, t.regexp, t.color, t.url], color: latte.pink },
  { tag: [t.name, t.variableName], color: latte.text },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
    color: latte.blue
  },
  {
    tag: [t.definition(t.name), t.definition(t.variableName), t.className],
    color: latte.yellow
  },
  { tag: [t.typeName, t.namespace, t.tagName], color: latte.yellow },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: latte.lavender },
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
    color: latte.sky
  },
  { tag: [t.punctuation, t.separator, t.bracket], color: latte.overlay2 },
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
    color: latte.mauve,
    fontWeight: "700"
  },
  { tag: t.strong, color: latte.maroon, fontWeight: "700" },
  { tag: t.emphasis, color: latte.maroon, fontStyle: "italic" },
  { tag: t.link, color: latte.blue, textDecoration: "underline" },
  { tag: t.quote, color: latte.teal, fontStyle: "italic" },
  {
    tag: t.monospace,
    color: latte.green,
    backgroundColor: latte.surface0,
    borderRadius: "4px"
  },
  { tag: t.contentSeparator, color: latte.overlay0 },
  { tag: t.inserted, color: latte.green },
  { tag: t.deleted, color: latte.red },
  { tag: t.invalid, color: latte.red, textDecoration: "underline wavy" }
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
        color: latte.text,
        backgroundColor: latte.base
      },
      "&.cm-focused": {
        outline: "none"
      },
      ".cm-scroller": {
        overflow: "auto",
        backgroundColor: latte.base,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: "13px",
        lineHeight: "1.5",
        touchAction: "pan-y"
      },
      ".cm-content": {
        minHeight: "100%",
        padding: "0.75rem 0",
        caretColor: latte.rosewater
      },
      ".cm-cursor": {
        borderLeftColor: latte.rosewater
      },
      ".cm-line": {
        padding: "0 0.75rem"
      },
      ".cm-gutters": {
        borderRight: `1px solid ${latte.surface0}`,
        color: latte.overlay0,
        backgroundColor: latte.mantle
      },
      ".cm-activeLine": {
        backgroundColor: "rgb(204 208 218 / 0.38)"
      },
      ".cm-activeLineGutter": {
        color: latte.lavender,
        backgroundColor: latte.surface0,
        fontWeight: "600"
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "rgb(30 102 245 / 0.18)"
      },
      ".cm-searchMatch": {
        backgroundColor: "rgb(223 142 29 / 0.18)",
        outline: "1px solid rgb(223 142 29 / 0.38)"
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "rgb(254 100 11 / 0.24)"
      },
      ".cm-matchingBracket": {
        color: latte.green,
        backgroundColor: latte.surface0,
        outline: `1px solid ${latte.surface1}`
      },
      ".cm-nonmatchingBracket": {
        color: latte.red
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
        color: latte.overlay1,
        cursor: "pointer",
        verticalAlign: "middle",
        transition: "color 160ms ease, background-color 160ms ease"
      },
      ".cm-foldMarker:hover": {
        color: latte.blue,
        backgroundColor: latte.surface0
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
        border: `1px solid ${latte.surface1}`,
        borderRadius: "6px",
        color: latte.subtext0,
        backgroundColor: latte.surface0,
        font: "inherit",
        fontSize: "0.85em",
        lineHeight: "1.35",
        cursor: "pointer",
        verticalAlign: "baseline"
      },
      ".cm-foldPlaceholder:hover": {
        color: latte.blue,
        borderColor: latte.surface2,
        backgroundColor: latte.surface1
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
    { dark: false }
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
  syntaxHighlighting(catppuccinLatteHighlight, { fallback: true }),
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
