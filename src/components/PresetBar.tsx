"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BUILTIN_PRESETS,
  SIZE_CHIPS,
  getBuiltinPreset,
  type BuiltinPresetId,
} from "@/lib/paramPresets";
import { paramsEqual, selectParams, useParamStore } from "@/lib/store";
import { DEFAULT_PARAMS } from "@/lib/types";
import {
  deleteUserPreset,
  listUserPresets,
  renameUserPreset,
  saveUserPreset,
  type SavedPreset,
} from "@/lib/userPresets";

type Selection =
  | { kind: "builtin"; id: BuiltinPresetId }
  | { kind: "user"; id: string }
  | { kind: "custom" };

interface Anchor {
  params: ReturnType<typeof selectParams>;
  selection: Exclude<Selection, { kind: "custom" }>;
}

export function PresetBar() {
  const loadParams = useParamStore((s) => s.loadParams);
  const resetTick = useParamStore((s) => s.resetTick);
  const paramsVersion = useParamStore((s) => s.paramsVersion);
  const [userPresets, setUserPresets] = useState<SavedPreset[]>([]);
  const [anchor, setAnchor] = useState<Anchor>({
    params: DEFAULT_PARAMS,
    selection: { kind: "builtin", id: "default" },
  });
  const [editing, setEditing] = useState(false);
  const [editMode, setEditMode] = useState<"save" | "rename">("save");
  const [nameDraft, setNameDraft] = useState("");

  const refreshUser = useCallback(() => setUserPresets(listUserPresets()), []);

  useEffect(() => refreshUser(), [refreshUser]);

  useEffect(() => {
    setAnchor({ params: DEFAULT_PARAMS, selection: { kind: "builtin", id: "default" } });
    setEditing(false);
  }, [resetTick]);

  const selectedBuiltin =
    anchor.selection.kind === "builtin"
      ? getBuiltinPreset(anchor.selection.id)
      : null;
  const selectedUser =
    anchor.selection.kind === "user"
      ? userPresets.find((p) => p.id === anchor.selection.id)
      : undefined;

  const isDirty = useMemo(
    () => !paramsEqual(selectParams(useParamStore.getState()), anchor.params),
    // paramsVersion is the intentional trigger; the params are read imperatively
    // via getState() so the memo recomputes on any change without subscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paramsVersion, anchor],
  );
  const effectiveSelection: Selection = isDirty
    ? { kind: "custom" }
    : anchor.selection;

  function applyBuiltin(id: BuiltinPresetId) {
    const p = getBuiltinPreset(id).params;
    loadParams(p);
    setAnchor({ params: p, selection: { kind: "builtin", id } });
    setEditing(false);
  }

  function applyUser(id: string) {
    const preset = userPresets.find((p) => p.id === id);
    if (!preset) return;
    loadParams(preset.params);
    setAnchor({ params: preset.params, selection: { kind: "user", id } });
    setEditing(false);
  }

  function handleSelect(value: string) {
    if (value.startsWith("builtin:")) {
      applyBuiltin(value.slice(8) as BuiltinPresetId);
      return;
    }
    if (value.startsWith("user:")) {
      applyUser(value.slice(5));
      return;
    }
  }

  function startSaveAs() {
    setEditMode("save");
    setNameDraft(
      selectedUser?.name ?? selectedBuiltin?.name ?? "My preset",
    );
    setEditing(true);
  }

  function startRename() {
    if (anchor.selection.kind !== "user" || !selectedUser) return;
    setEditMode("rename");
    setNameDraft(selectedUser.name);
    setEditing(true);
  }

  function commitEdit() {
    if (editMode === "rename") commitRename();
    else commitSave();
  }

  function commitSave() {
    const params = selectParams(useParamStore.getState());
    const saved = saveUserPreset(nameDraft, params);
    refreshUser();
    setAnchor({ params, selection: { kind: "user", id: saved.id } });
    setEditing(false);
  }

  function commitUpdate() {
    if (anchor.selection.kind !== "user" || !selectedUser) return;
    const params = selectParams(useParamStore.getState());
    saveUserPreset(selectedUser.name, params);
    refreshUser();
    setAnchor({ params, selection: { kind: "user", id: selectedUser.id } });
  }

  function commitRename() {
    if (anchor.selection.kind !== "user" || !selectedUser) return;
    renameUserPreset(selectedUser.id, nameDraft);
    refreshUser();
    setEditing(false);
  }

  function handleDelete() {
    if (anchor.selection.kind !== "user" || !selectedUser) return;
    deleteUserPreset(selectedUser.id);
    refreshUser();
    applyBuiltin("default");
  }

  const selectValue =
    effectiveSelection.kind === "builtin"
      ? `builtin:${effectiveSelection.id}`
      : effectiveSelection.kind === "user"
        ? `user:${effectiveSelection.id}`
        : "custom";

  return (
    <div className="space-y-3 border-b border-zinc-800/80 pb-3">
      <div className="flex items-center gap-2">
        <select
          value={selectValue}
          onChange={(e) => handleSelect(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-zinc-700/80 bg-zinc-900/80 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-[var(--accent)]/50"
          aria-label="Parameter preset"
        >
          <optgroup label="Suggested">
            {BUILTIN_PRESETS.map((preset) => (
              <option key={preset.id} value={`builtin:${preset.id}`}>
                {preset.name}
              </option>
            ))}
          </optgroup>
          {userPresets.length > 0 && (
            <optgroup label="Saved">
              {userPresets.map((preset) => (
                <option key={preset.id} value={`user:${preset.id}`}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
          )}
          {effectiveSelection.kind === "custom" && (
            <option value="custom">Custom (unsaved)</option>
          )}
        </select>
        {effectiveSelection.kind === "custom" && (
          <span className="text-[10px] font-mono uppercase text-amber-400/90 shrink-0">
            edited
          </span>
        )}
      </div>

      {effectiveSelection.kind === "custom" && (
        <p className="text-xs leading-snug text-zinc-500">
          Unsaved configuration — tweak sliders then use Save as…
        </p>
      )}

      {!isDirty && (selectedBuiltin || selectedUser) && (
        <p className="text-xs leading-snug text-zinc-500">
          {selectedUser ? "Saved preset" : selectedBuiltin!.description}
        </p>
      )}

      {editing ? (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Preset name"
            className="min-w-0 flex-1 rounded-md border border-zinc-700/80 bg-zinc-900/80 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-[var(--accent)]/50"
            onKeyDown={(e) => e.key === "Enter" && commitEdit()}
          />
          <button
            type="button"
            onClick={commitEdit}
            className="rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-sm font-semibold text-zinc-950"
          >
            {editMode === "rename" ? "Rename" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-zinc-700 px-2 py-1.5 text-sm text-zinc-400"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={startSaveAs}
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition"
          >
            Save as…
          </button>
          {anchor.selection.kind === "user" && isDirty && (
            <button
              type="button"
              onClick={commitUpdate}
              className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-1 text-xs font-medium text-[var(--accent)] transition"
            >
              Update
            </button>
          )}
          {anchor.selection.kind === "user" && (
            <>
              <button
                type="button"
                onClick={startRename}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md border border-zinc-800 px-2 py-1 text-xs font-medium text-red-400/80 hover:border-red-900 transition"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">Size</p>
        <div className="flex gap-1">
          {SIZE_CHIPS.map(({ label, presetId }) => (
            <Chip
              key={label}
              label={label}
              active={
                !isDirty &&
                anchor.selection.kind === "builtin" &&
                anchor.selection.id === presetId
              }
              onClick={() => applyBuiltin(presetId)}
            />
          ))}
        </div>
      </div>

    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-md border px-2 py-1 text-xs font-medium transition",
        active
          ? "border-[var(--accent)]/50 bg-[var(--accent)]/12 text-[var(--accent)]"
          : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
      )}
    >
      {label}
    </button>
  );
}
