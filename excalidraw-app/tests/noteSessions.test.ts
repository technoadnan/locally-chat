import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { beforeEach, describe, expect, it } from "vitest";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";
import {
  createNoteSession,
  deleteNoteSession,
  duplicateNoteSession,
  getActiveNoteSessionId,
  getFileIdsAcrossNoteSessions,
  initializeNoteSessions,
  loadNoteSessionScene,
  loadNoteSessions,
  renameNoteSession,
  saveNoteSessionScene,
  setActiveNoteSessionId,
} from "../data/noteSessions";

const appState = (name: string) =>
  ({ ...getDefaultAppState(), name } as AppState);

const rectangle = (id: string) =>
  ({ id, type: "rectangle", isDeleted: false } as ExcalidrawElement);

const image = (id: string, fileId: string) =>
  ({
    id,
    type: "image",
    fileId,
    status: "saved",
    isDeleted: false,
  } as ExcalidrawElement);

beforeEach(() => {
  localStorage.clear();
});

describe("note sessions", () => {
  it("creates sessions and lists them most-recently-updated first", () => {
    const first = createNoteSession("First");
    const second = createNoteSession("Second");

    const sessions = loadNoteSessions();
    expect(sessions.map((session) => session.name)).toEqual([
      "Second",
      "First",
    ]);
    expect(sessions.map((session) => session.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("keeps each session's scene separate", async () => {
    const a = createNoteSession("A");
    const b = createNoteSession("B");

    await saveNoteSessionScene(a.id, [rectangle("a1")], appState("A"));
    await saveNoteSessionScene(
      b.id,
      [rectangle("b1"), rectangle("b2")],
      appState("B"),
    );

    expect(
      (await loadNoteSessionScene(a.id)).elements.map((el) => el.id),
    ).toEqual(["a1"]);
    expect(
      (await loadNoteSessionScene(b.id)).elements.map((el) => el.id),
    ).toEqual(["b1", "b2"]);
  });

  it("returns an empty scene for a session that was never saved", async () => {
    const session = createNoteSession("Fresh");
    expect(await loadNoteSessionScene(session.id)).toEqual({
      elements: [],
      appState: null,
    });
  });

  it("drops deleted elements when saving", async () => {
    const session = createNoteSession("A");
    const deleted = { ...rectangle("gone"), isDeleted: true };

    await saveNoteSessionScene(
      session.id,
      [rectangle("kept"), deleted as ExcalidrawElement],
      appState("A"),
    );

    expect(
      (await loadNoteSessionScene(session.id)).elements.map((el) => el.id),
    ).toEqual(["kept"]);
  });

  it("renames a session", () => {
    const session = createNoteSession("Before");
    renameNoteSession(session.id, "After");
    expect(loadNoteSessions()[0].name).toBe("After");
  });

  it("follows the canvas name when the scene is saved", async () => {
    const session = createNoteSession("Old name");
    await saveNoteSessionScene(session.id, [], appState("Renamed on canvas"));
    expect(loadNoteSessions()[0].name).toBe("Renamed on canvas");
  });

  it("duplicates a session with a copy of its scene", async () => {
    const source = createNoteSession("Source");
    await saveNoteSessionScene(
      source.id,
      [rectangle("s1")],
      appState("Source"),
    );

    const duplicate = await duplicateNoteSession(source.id);

    expect(duplicate).not.toBeNull();
    expect(duplicate!.name).toBe("Source (copy)");
    expect(duplicate!.id).not.toBe(source.id);
    expect(
      (await loadNoteSessionScene(duplicate!.id)).elements.map((el) => el.id),
    ).toEqual(["s1"]);

    // editing the copy must not touch the original
    await saveNoteSessionScene(duplicate!.id, [], appState("Source (copy)"));
    expect(
      (await loadNoteSessionScene(source.id)).elements.map((el) => el.id),
    ).toEqual(["s1"]);
  });

  it("deletes a session along with its scene", async () => {
    const doomed = createNoteSession("Doomed");
    const keeper = createNoteSession("Keeper");
    await saveNoteSessionScene(
      doomed.id,
      [rectangle("d1")],
      appState("Doomed"),
    );

    const next = await deleteNoteSession(doomed.id);

    expect(next.id).toBe(keeper.id);
    expect(loadNoteSessions().map((session) => session.id)).toEqual([
      keeper.id,
    ]);
    expect(await loadNoteSessionScene(doomed.id)).toEqual({
      elements: [],
      appState: null,
    });
  });

  it("creates a replacement when the last session is deleted", async () => {
    const only = createNoteSession("Only");
    const next = await deleteNoteSession(only.id);

    expect(next.id).not.toBe(only.id);
    expect(loadNoteSessions().map((session) => session.id)).toEqual([next.id]);
  });

  it("collects file ids across every session, not just the active one", async () => {
    const a = createNoteSession("A");
    const b = createNoteSession("B");

    await saveNoteSessionScene(a.id, [image("i1", "file-a")], appState("A"));
    await saveNoteSessionScene(b.id, [image("i2", "file-b")], appState("B"));

    const fileIds = await getFileIdsAcrossNoteSessions();
    expect([...fileIds].sort()).toEqual(["file-a", "file-b"] as FileId[]);
  });
});

describe("note sessions bootstrap", () => {
  it("creates a first session when there is nothing stored", async () => {
    const session = await initializeNoteSessions();

    expect(loadNoteSessions().map((s) => s.id)).toEqual([session.id]);
    expect(getActiveNoteSessionId()).toBe(session.id);
  });

  it("migrates a pre-note-sessions scene into the first session", async () => {
    localStorage.setItem(
      STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_ELEMENTS,
      JSON.stringify([rectangle("legacy")]),
    );
    localStorage.setItem(
      STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_APP_STATE,
      JSON.stringify({ name: "My old canvas", viewBackgroundColor: "#ffffff" }),
    );

    const session = await initializeNoteSessions();

    expect(session.name).toBe("My old canvas");
    expect(
      (await loadNoteSessionScene(session.id)).elements.map((el) => el.id),
    ).toEqual(["legacy"]);
    // legacy keys are cleared so the scene isn't stored twice
    expect(
      localStorage.getItem(STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_ELEMENTS),
    ).toBeNull();
    expect(
      localStorage.getItem(STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_APP_STATE),
    ).toBeNull();
  });

  it("reopens the session that was active", async () => {
    createNoteSession("A");
    const b = createNoteSession("B");
    const c = createNoteSession("C");
    setActiveNoteSessionId(b.id);

    expect((await initializeNoteSessions()).id).toBe(b.id);
    expect(c.id).not.toBe(b.id);
  });

  it("falls back to the most recent session when the active one is gone", async () => {
    const a = createNoteSession("A");
    setActiveNoteSessionId("deleted-in-another-tab");

    const session = await initializeNoteSessions();

    expect(session.id).toBe(a.id);
    expect(getActiveNoteSessionId()).toBe(a.id);
  });
});
