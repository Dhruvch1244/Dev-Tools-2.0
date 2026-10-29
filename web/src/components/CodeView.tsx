import { useEffect, useRef } from 'react';
import { EditorView, Decoration, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, type DecorationSet } from '@codemirror/view';
import { Annotation, EditorState, StateEffect, StateField, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';
import type { Lang } from '../core/dsa/vizCode';

// F1 syntax palette: keywords in racing red, types in timing purple, numbers in yellow.
const f1Highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier], color: '#ff5747', fontWeight: '600' },
  { tag: [t.typeName, t.className, t.standard(t.typeName)], color: '#b26bff' },
  { tag: [t.number, t.bool, t.null], color: '#ffd23f' },
  { tag: [t.string, t.character], color: '#2bd46b' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#6a7080', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#4fb3ff' },
  { tag: [t.definition(t.variableName)], color: '#f4f5f7' },
  { tag: [t.operator, t.punctuation, t.bracket], color: '#a6abb6' },
  { tag: [t.processingInstruction, t.macroName], color: '#ff5747' },
]);

const langExt = (l: Lang) => (l === 'cpp' ? cpp() : l === 'java' ? java() : python());

// Marks changes made by props (loading a template/solution) so they aren't reported as user edits —
// otherwise merely opening a problem would save its template as the user's solution.
const external = Annotation.define<boolean>();

const setHighlight = StateEffect.define<number | null>();
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (!e.is(setHighlight)) continue;
      if (e.value == null || e.value < 1 || e.value > tr.state.doc.lines) return Decoration.none;
      const line = tr.state.doc.line(e.value);
      return Decoration.set([Decoration.line({ class: 'cm-viz-line' }).range(line.from)]);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function CodeView({ value, lang, onChange, readOnly = false, highlightLine, minHeight = 120, maxHeight = 520 }: {
  value: string;
  lang: Lang;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  highlightLine?: number | null;
  minHeight?: number;
  maxHeight?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langComp = useRef(new Compartment());
  const roComp = useRef(new Compartment());
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          bracketMatching(),
          closeBrackets(),
          indentOnInput(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          syntaxHighlighting(f1Highlight),
          langComp.current.of(langExt(lang)),
          roComp.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          highlightField,
          EditorState.tabSize.of(4),
          EditorView.theme({ '&': { minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }, '.cm-scroller': { overflow: 'auto' }, '.cm-content': { caretColor: '#e10600' } }, { dark: true }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((t) => t.annotation(external))) change.current?.(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // the editor is created once; props below are synced through effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, annotations: external.of(true) });
  }, [value]);
  useEffect(() => view.current?.dispatch({ effects: langComp.current.reconfigure(langExt(lang)) }), [lang]);
  useEffect(() => view.current?.dispatch({ effects: roComp.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]) }), [readOnly]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: setHighlight.of(highlightLine ?? null) });
    if (highlightLine && highlightLine <= v.state.doc.lines) {
      v.dispatch({ effects: EditorView.scrollIntoView(v.state.doc.line(highlightLine).from, { y: 'nearest' }) });
    }
  }, [highlightLine, value]);

  return <div ref={host} className="text-left" />;
}
