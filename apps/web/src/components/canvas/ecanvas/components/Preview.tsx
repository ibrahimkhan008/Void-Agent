import {
  type ArtifactElementSelection,
  parseArtifactElementSelection,
  parseEditedArtifact,
} from "lib/ecanvas/artifact-editor-protocol";
import React, { useEffect, useMemo, useState } from "react";
import "./Preview.css";

const EDITOR_SCRIPT = `(() => {
  let enabled = false;
  let selectedId = null;
  const toHex = (value) => {
    const parts = value.match(/[\\d.]+/g)?.map(Number) || [];
    if (parts.length < 3) return "#000000";
    return "#" + parts.slice(0, 3).map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0")).join("");
  };
  const sendArtifact = () => {
    const copy = document.documentElement.cloneNode(true);
    copy.querySelector("#void-agent-artifact-editor")?.remove();
    copy.querySelectorAll("[data-va-edit-id]").forEach((item) => item.removeAttribute("data-va-edit-id"));
    window.parent.postMessage({ type: "void-agent-artifact-edited", html: "<!doctype html>" + copy.outerHTML }, "*");
  };
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
    if (event.data.type === "void-agent-edit-mode") enabled = event.data.enabled === true;
    if (event.data.type === "void-agent-apply-edit" && selectedId) {
      const element = document.querySelector('[data-va-edit-id="' + CSS.escape(selectedId) + '"]');
      if (!element) return;
      if (typeof event.data.text === "string" && element.children.length === 0) element.textContent = event.data.text.slice(0, 4000);
      if (typeof event.data.color === "string" && CSS.supports("color", event.data.color)) element.style.color = event.data.color;
      if (typeof event.data.backgroundColor === "string" && CSS.supports("color", event.data.backgroundColor)) element.style.backgroundColor = event.data.backgroundColor;
      if (Number.isFinite(event.data.fontSize)) element.style.fontSize = Math.max(8, Math.min(96, event.data.fontSize)) + "px";
      sendArtifact();
      return;
    }
    if (event.data.type === "void-agent-artifact-operation" && selectedId) {
      const element = document.querySelector('[data-va-edit-id="' + CSS.escape(selectedId) + '"]');
      if (!element || ["BODY", "HTML", "HEAD", "SCRIPT", "STYLE", "IFRAME"].includes(element.tagName)) return;
      if (event.data.operation === "remove") element.remove();
      if (event.data.operation === "move-up" && element.previousElementSibling) element.parentElement?.insertBefore(element, element.previousElementSibling);
      if (event.data.operation === "move-down" && element.nextElementSibling) element.parentElement?.insertBefore(element.nextElementSibling, element);
      if (event.data.operation === "add-text") {
        const parent = element.children.length > 0 ? element : element.parentElement;
        if (!parent || ["BODY", "HTML", "HEAD"].includes(parent.tagName)) return;
        const added = document.createElement("p");
        added.textContent = typeof event.data.text === "string" ? event.data.text.slice(0, 4000) : "New text";
        parent.insertBefore(added, parent === element ? null : element.nextElementSibling);
      }
      selectedId = null;
      sendArtifact();
    }
    if (event.data.type === "void-agent-apply-edit-plan" && Array.isArray(event.data.operations)) {
      let applied = 0;
      const safeTarget = (selector) => {
        if (typeof selector !== "string" || selector.length > 160) return null;
        try {
          const element = document.querySelector(selector);
          if (!element || ["BODY", "HTML", "HEAD", "SCRIPT", "STYLE", "IFRAME"].includes(element.tagName)) return null;
          return element;
        } catch { return null; }
      };
      for (const operation of event.data.operations.slice(0, 20)) {
        if (!operation || typeof operation !== "object") continue;
        const element = safeTarget(operation.selector);
        if (!element) continue;
        if (operation.operation === "set-text" && typeof operation.text === "string" && operation.text.length <= 4000 && element.children.length === 0) {
          element.textContent = operation.text;
          applied++;
        } else if (operation.operation === "set-style") {
          if ((operation.property === "color" || operation.property === "backgroundColor") && typeof operation.value === "string" && /^#[0-9a-f]{6}$/i.test(operation.value)) {
            element.style[operation.property] = operation.value;
            applied++;
          } else if (operation.property === "fontSize" && typeof operation.value === "string" && /^(8|[1-9][0-9]?|96)px$/.test(operation.value)) {
            element.style.fontSize = operation.value;
            applied++;
          }
        } else if (operation.operation === "remove") {
          element.remove();
          applied++;
        } else if (operation.operation === "insert-after" && ["p", "h2", "li", "div"].includes(operation.tag) && typeof operation.text === "string" && operation.text.length <= 4000 && element.parentElement) {
          const added = document.createElement(operation.tag);
          added.textContent = operation.text;
          element.parentElement.insertBefore(added, element.nextElementSibling);
          applied++;
        } else if (operation.operation === "move-before") {
          const target = safeTarget(operation.targetSelector);
          if (target && target !== element && target.parentElement === element.parentElement && element.parentElement) {
            target.parentElement.insertBefore(element, target);
            applied++;
          }
        }
      }
      if (applied > 0) sendArtifact();
      window.parent.postMessage({ type: "void-agent-edit-plan-complete", applied }, "*");
    }
  });
  document.addEventListener("click", (event) => {
    if (!enabled) return;
    const target = event.target instanceof Element ? event.target.closest("h1,h2,h3,h4,p,span,button,a,li,td,th,label,small,strong,em,section,article,main,header,footer,nav,div") : null;
    if (!target || target === document.body || target === document.documentElement) return;
    event.preventDefault();
    event.stopPropagation();
    selectedId = crypto.randomUUID();
    target.setAttribute("data-va-edit-id", selectedId);
    const style = getComputedStyle(target);
    window.parent.postMessage({
      type: "void-agent-element-selected",
      selection: { id: selectedId, text: target.children.length === 0 ? (target.textContent || "").slice(0, 4000) : "", canEditText: target.children.length === 0, color: toHex(style.color), backgroundColor: style.backgroundColor === "rgba(0, 0, 0, 0)" ? "#ffffff" : toHex(style.backgroundColor), fontSize: Number.parseFloat(style.fontSize) || 16 }
    }, "*");
  }, true);
})();`;

function buildEditableDocument(html: string) {
  const script = `<script id="void-agent-artifact-editor">${EDITOR_SCRIPT}</script>`;
  return /<\/body\s*>/iu.test(html)
    ? html.replace(/<\/body\s*>/iu, `${script}</body>`)
    : `${html}${script}`;
}

interface Props {
  html: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onArtifactEdited: (html: string) => void;
  onEditPlanResult: (applied: number) => void;
}

export function Preview({
  html,
  iframeRef,
  onArtifactEdited,
  onEditPlanResult,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [selection, setSelection] = useState<ArtifactElementSelection | null>(
    null,
  );
  const [text, setText] = useState("");
  const [color, setColor] = useState("#000000");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [fontSize, setFontSize] = useState(16);
  const srcDoc = useMemo(() => buildEditableDocument(html), [html]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as {
        type?: unknown;
        selection?: unknown;
        html?: unknown;
        applied?: unknown;
      } | null;
      if (!data || typeof data !== "object") return;
      if (
        data.type === "void-agent-element-selected" &&
        data.selection &&
        typeof data.selection === "object"
      ) {
        const next = parseArtifactElementSelection(data.selection);
        if (!next) return;
        setSelection(next);
        setText(next.text);
        setColor(next.color);
        setBackgroundColor(next.backgroundColor);
        setFontSize(Math.max(8, Math.min(96, next.fontSize)));
      }
      if (
        data.type === "void-agent-artifact-edited" &&
        parseEditedArtifact(data.html) !== null
      ) {
        onArtifactEdited(data.html as string);
        setSelection(null);
      }
      if (
        data.type === "void-agent-edit-plan-complete" &&
        Number.isInteger(data.applied) &&
        (data.applied as number) >= 0 &&
        (data.applied as number) <= 20
      ) {
        onEditPlanResult(data.applied as number);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeRef, onArtifactEdited, onEditPlanResult]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "void-agent-edit-mode", enabled: editMode },
      "*",
    );
  }, [editMode, iframeRef, srcDoc]);

  const applyEdit = () => {
    if (!selection) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "void-agent-apply-edit",
        text,
        color,
        backgroundColor,
        fontSize,
      },
      "*",
    );
  };

  const applyOperation = (
    operation: "add-text" | "move-up" | "move-down" | "remove",
  ) => {
    if (!selection) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "void-agent-artifact-operation", operation, text: "New text" },
      "*",
    );
  };

  if (!html) {
    return (
      <div className="preview-empty">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.3"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="m9 8 6 4-6 4Z" />
        </svg>
        <p>Draw or drop references in frames, describe it, and hit Generate</p>
        <span className="preview-hint">
          Void Agent will turn your sketch into code
        </span>
      </div>
    );
  }

  return (
    <div className="artifact-preview">
      <div className="artifact-edit-toolbar">
        <button
          type="button"
          className={editMode ? "active" : ""}
          onClick={() => {
            setEditMode((enabled) => !enabled);
            setSelection(null);
          }}
        >
          {editMode ? "Exit edit mode" : "Edit artifact"}
        </button>
        {editMode && <span>Click a text item in the preview to edit it.</span>}
      </div>
      {editMode && selection && (
        <form
          className="artifact-element-editor"
          onSubmit={(event) => {
            event.preventDefault();
            applyEdit();
          }}
        >
          <label>
            Text
            <input
              maxLength={4000}
              value={text}
              disabled={!selection.canEditText}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <label>
            Text color
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </label>
          <label>
            Background
            <input
              type="color"
              value={backgroundColor}
              onChange={(event) => setBackgroundColor(event.target.value)}
            />
          </label>
          <label>
            Size
            <input
              type="number"
              min={8}
              max={96}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
          </label>
          <button type="submit">Apply edit</button>
          <button type="button" onClick={() => applyOperation("add-text")}>
            Add text
          </button>
          <button type="button" onClick={() => applyOperation("move-up")}>
            Move up
          </button>
          <button type="button" onClick={() => applyOperation("move-down")}>
            Move down
          </button>
          <button type="button" onClick={() => applyOperation("remove")}>
            Remove
          </button>
        </form>
      )}
      <iframe
        ref={iframeRef}
        className={`preview-frame ${editMode ? "artifact-editing" : ""}`}
        srcDoc={srcDoc}
        // allow-same-origin must NOT be combined with allow-scripts: that
        // lets framed content reach the parent origin and script this app.
        sandbox="allow-scripts"
        title="Preview"
      />
    </div>
  );
}
