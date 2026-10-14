"use client";

import { type Editor, EditorContent, type JSONContent, useEditor, useEditorState } from "@tiptap/react";
import { useState } from "react";
import { VARIABLE_NAME_PATTERN } from "@/lib/editor/content";
import { editorExtensions, FIELD_KINDS, FIELD_LABELS, type FieldKind } from "@/lib/editor/extensions";
import { AUTOMATIC_VARIABLES } from "@/lib/editor/variables";
import { newId } from "@/lib/ids";

type RichEditorProps = {
  initialContent: JSONContent;
  roles: string[];
  editable?: boolean;
  onChange: (content: JSONContent) => void;
};

export function RichEditor({ initialContent, roles, editable = true, onChange }: RichEditorProps) {
  const editor = useEditor({
    extensions: editorExtensions,
    content: initialContent,
    editable,
    // Server rendering has no DOM; the editor mounts on the client.
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "pp-editor min-h-[420px] p-6 focus:outline-none", "aria-label": "Document content" },
    },
    onUpdate: ({ editor: current }) => onChange(current.getJSON()),
  });

  if (!editor) return <div className="min-h-[420px] rounded-md border border-neutral-300 bg-white" />;
  return (
    <div className="rounded-md border border-neutral-300 bg-white">
      {editable && <Toolbar editor={editor} roles={roles} />}
      <EditorContent editor={editor} />
    </div>
  );
}

const control = "rounded border border-neutral-300 bg-white px-1 py-1 text-sm";

function ToolbarButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="rounded px-2 py-1 text-sm hover:bg-neutral-100 disabled:opacity-40"
      disabled={disabled}
      // Keeps the editor selection when the button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function hasQuoteBlock(editor: Editor): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "quoteBlock") found = true;
    return !found;
  });
  return found;
}

function Toolbar({ editor, roles }: { editor: Editor; roles: string[] }) {
  const { hasQuote } = useEditorState({ editor, selector: ({ editor: current }) => ({ hasQuote: hasQuoteBlock(current) }) });
  const [fieldKind, setFieldKind] = useState<FieldKind>("signature");
  const [fieldRole, setFieldRole] = useState(roles[0] ?? "Client");
  const [customVariable, setCustomVariable] = useState("");
  const role = roles.includes(fieldRole) ? fieldRole : (roles[0] ?? "Client");
  const chain = () => editor.chain().focus();

  function insertVariable(name: string) {
    if (VARIABLE_NAME_PATTERN.test(name)) chain().insertContent(`[${name}]`).run();
  }

  return (
    <div role="toolbar" aria-label="Editor tools" className="flex flex-wrap items-center gap-1 border-b border-neutral-200 p-2">
      <ToolbarButton label="H1" onClick={() => chain().toggleHeading({ level: 1 }).run()} />
      <ToolbarButton label="H2" onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton label="Bold" onClick={() => chain().toggleBold().run()} />
      <ToolbarButton label="Italic" onClick={() => chain().toggleItalic().run()} />
      <ToolbarButton label="Bullets" onClick={() => chain().toggleBulletList().run()} />
      <ToolbarButton label="Numbers" onClick={() => chain().toggleOrderedList().run()} />
      <ToolbarButton label="Table" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      <ToolbarButton label="Page break" onClick={() => chain().insertContent({ type: "pageBreak" }).run()} />
      <ToolbarButton
        label="Pricing table"
        disabled={hasQuote}
        onClick={() => chain().insertContent({ type: "quoteBlock" }).run()}
      />

      <span aria-hidden className="mx-2 h-5 w-px bg-neutral-200" />
      <label htmlFor="field-kind" className="sr-only">
        Field type
      </label>
      <select id="field-kind" value={fieldKind} onChange={(event) => setFieldKind(event.target.value as FieldKind)} className={control}>
        {FIELD_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {FIELD_LABELS[kind]}
          </option>
        ))}
      </select>
      <label htmlFor="field-role" className="sr-only">
        Field role
      </label>
      <select id="field-role" value={role} onChange={(event) => setFieldRole(event.target.value)} className={control}>
        {roles.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <ToolbarButton
        label="Insert field"
        disabled={roles.length === 0}
        onClick={() =>
          chain()
            .insertContent({
              type: "field",
              attrs: { id: newId(), kind: fieldKind, role, required: fieldKind !== "checkbox", label: "" },
            })
            .run()
        }
      />

      <span aria-hidden className="mx-2 h-5 w-px bg-neutral-200" />
      <label htmlFor="variable-pick" className="sr-only">
        Insert a variable
      </label>
      <select id="variable-pick" value="" onChange={(event) => insertVariable(event.target.value)} className={control}>
        <option value="">Insert variable…</option>
        {AUTOMATIC_VARIABLES.map((name) => (
          <option key={name} value={name}>
            [{name}]
          </option>
        ))}
      </select>
      <label htmlFor="variable-custom" className="sr-only">
        Custom variable name
      </label>
      <input
        id="variable-custom"
        value={customVariable}
        onChange={(event) => setCustomVariable(event.target.value)}
        placeholder="Deal.Value"
        className={`${control} w-28`}
      />
      <ToolbarButton
        label="Insert"
        disabled={!VARIABLE_NAME_PATTERN.test(customVariable)}
        onClick={() => {
          insertVariable(customVariable);
          setCustomVariable("");
        }}
      />
    </div>
  );
}
