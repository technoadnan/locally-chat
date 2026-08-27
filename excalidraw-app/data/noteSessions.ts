/**
 * Note sessions — the app stores any number of separate whiteboards ("note
 * sessions") locally, instead of the single canvas Excalidraw keeps in
 * localStorage upstream.
 *
 * Storage layout:
 *
 * - the session *index* (id, name, timestamps) lives in localStorage. It is
 *   small, and keeping it there lets us read it synchronously while rendering
 *   and sync it between tabs via the `storage` event.
 * - each session's *scene* (elements + appState) lives in indexedDB, keyed by
 *   session id. Scenes are far too big to keep several of them in the ~5MB
 *   localStorage budget.
 * - binary files (images) stay in their own indexedDB store, shared by all
 *   sessions and keyed by file id, exactly as upstream.
 *
 * Only one session is open at a time, and which one is open is global rather
 * than per-tab — that preserves upstream's behaviour of every tab mirroring
 * the same scene.
 */

import { randomId } from "@excalidraw/common";
import {
  getNonDeletedElements,
  isInitializedImageElement,
} from "@excalidraw/element";
import {
  clearAppStateForLocalStorage,
  getDefaultAppState,
} from "@excalidraw/excalidraw/appState";
import { createStore, del, get, getMany, set } from "idb-keyval";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

import { updateBrowserStateVersion } from "./tabSync";

export type NoteSessionMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

/** exactly the appState subset Excalidraw persists to browser storage */
export type PersistedAppState = ReturnType<typeof clearAppStateForLocalStorage>;

export type NoteSessionScene = {
  elements: ExcalidrawElement[];
  appState: PersistedAppState | null;
};

export const DEFAULT_NOTE_SESSION_NAME = "Untitled note";

const scenesStore = createStore(
  `${STORAGE_KEYS.IDB_NOTE_SESSIONS}-db`,
  `${STORAGE_KEYS.IDB_NOTE_SESSIONS}-store`,
);

const isNoteSessionMeta = (value: any): value is NoteSessionMeta =>
  !!value &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.createdAt === "number" &&
  typeof value.updatedAt === "number";

/** most recently updated first */
const sortSessions = (sessions: NoteSessionMeta[]) =>
  [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

// index
// -----------------------------------------------------------------------------

export const loadNoteSessions = (): NoteSessionMeta[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_NOTE_SESSIONS);
    if (!data) {
      return [];
    }
    const parsed = JSON.parse(data);
    return Array.isArray(parsed)
      ? sortSessions(parsed.filter(isNoteSessionMeta))
      : [];
  } catch (error: any) {
    console.error(error);
    return [];
  }
};

const saveNoteSessions = (sessions: NoteSessionMeta[]) => {
  try {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_NOTE_SESSIONS,
      JSON.stringify(sessions),
    );
    updateBrowserStateVersion(STORAGE_KEYS.VERSION_NOTE_SESSIONS);
  } catch (error: any) {
    console.error(error);
  }
};

export const getActiveNoteSessionId = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ACTIVE_NOTE_SESSION);
  } catch (error: any) {
    console.error(error);
    return null;
  }
};

export const setActiveNoteSessionId = (id: string) => {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_STORAGE_ACTIVE_NOTE_SESSION, id);
    updateBrowserStateVersion(STORAGE_KEYS.VERSION_NOTE_SESSIONS);
  } catch (error: any) {
    console.error(error);
  }
};

// scenes
// -----------------------------------------------------------------------------

export const loadNoteSessionScene = async (
  id: string,
): Promise<NoteSessionScene> => {
  try {
    const scene = await get<NoteSessionScene>(id, scenesStore);
    if (scene) {
      return {
        elements: Array.isArray(scene.elements) ? scene.elements : [],
        appState: scene.appState ?? null,
      };
    }
  } catch (error: any) {
    console.error(error);
  }
  return { elements: [], appState: null };
};

export const saveNoteSessionScene = async (
  id: string,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
) => {
  const scene: NoteSessionScene = {
    elements: getNonDeletedElements(elements) as ExcalidrawElement[],
    appState: clearAppStateForLocalStorage(appState),
  };
  await set(id, scene, scenesStore);
  touchNoteSession(id, { name: appState.name || undefined });
};

/**
 * Bumps a session's `updatedAt`, and optionally renames it. Renaming happens
 * on every save because the canvas name (appState.name) is what the user edits
 * in the editor, and the sessions list should follow it.
 */
export const touchNoteSession = (
  id: string,
  { name }: { name?: string } = {},
) => {
  const sessions = loadNoteSessions();
  const session = sessions.find((session) => session.id === id);
  if (!session) {
    return;
  }
  const nextName = name?.trim() || session.name;
  if (session.name === nextName) {
    // still bump the timestamp so the list stays ordered by recency
    session.updatedAt = Date.now();
  } else {
    session.name = nextName;
    session.updatedAt = Date.now();
  }
  saveNoteSessions(sessions);
};

// mutations
// -----------------------------------------------------------------------------

export const createNoteSession = (
  name = DEFAULT_NOTE_SESSION_NAME,
): NoteSessionMeta => {
  const now = Date.now();
  const session: NoteSessionMeta = {
    id: randomId(),
    name: name.trim() || DEFAULT_NOTE_SESSION_NAME,
    createdAt: now,
    updatedAt: now,
  };
  saveNoteSessions([session, ...loadNoteSessions()]);
  return session;
};

export const renameNoteSession = (id: string, name: string) => {
  const sessions = loadNoteSessions();
  const session = sessions.find((session) => session.id === id);
  if (!session) {
    return;
  }
  session.name = name.trim() || DEFAULT_NOTE_SESSION_NAME;
  session.updatedAt = Date.now();
  saveNoteSessions(sessions);
};

export const duplicateNoteSession = async (
  id: string,
): Promise<NoteSessionMeta | null> => {
  const sessions = loadNoteSessions();
  const source = sessions.find((session) => session.id === id);
  if (!source) {
    return null;
  }
  const scene = await loadNoteSessionScene(id);
  const duplicate = createNoteSession(`${source.name} (copy)`);
  await set(
    duplicate.id,
    { ...scene, appState: { ...scene.appState, name: duplicate.name } },
    scenesStore,
  );
  return duplicate;
};

/**
 * Deletes a session and its scene. Returns the session that should be opened
 * instead when the deleted one was active — creating a fresh one if this was
 * the last session, since the app always has exactly one session open.
 */
export const deleteNoteSession = async (
  id: string,
): Promise<NoteSessionMeta> => {
  const remaining = loadNoteSessions().filter((session) => session.id !== id);
  saveNoteSessions(remaining);
  try {
    await del(id, scenesStore);
  } catch (error: any) {
    console.error(error);
  }
  return remaining[0] ?? createNoteSession();
};

// files
// -----------------------------------------------------------------------------

/**
 * File ids referenced by *any* session. Files are shared across sessions, so
 * obsolete-file cleanup has to look at every scene, not just the open one —
 * otherwise images on the sessions you aren't looking at get garbage collected.
 */
export const getFileIdsAcrossNoteSessions = async (): Promise<FileId[]> => {
  const ids = loadNoteSessions().map((session) => session.id);
  if (!ids.length) {
    return [];
  }
  try {
    const scenes = await getMany<NoteSessionScene | undefined>(
      ids,
      scenesStore,
    );
    const fileIds = new Set<FileId>();
    for (const scene of scenes) {
      for (const element of scene?.elements ?? []) {
        if (isInitializedImageElement(element)) {
          fileIds.add(element.fileId);
        }
      }
    }
    return [...fileIds];
  } catch (error: any) {
    console.error(error);
    return [];
  }
};

// storage size (for the stats panel)
// -----------------------------------------------------------------------------

const sceneStorageSize = (scene: NoteSessionScene | undefined) =>
  scene ? JSON.stringify(scene).length : 0;

export const getNoteSessionStorageSize = async (id: string) => {
  try {
    return sceneStorageSize(await get<NoteSessionScene>(id, scenesStore));
  } catch (error: any) {
    console.error(error);
    return 0;
  }
};

export const getAllNoteSessionsStorageSize = async () => {
  const ids = loadNoteSessions().map((session) => session.id);
  if (!ids.length) {
    return 0;
  }
  try {
    const scenes = await getMany<NoteSessionScene | undefined>(
      ids,
      scenesStore,
    );
    return scenes.reduce((size, scene) => size + sceneStorageSize(scene), 0);
  } catch (error: any) {
    console.error(error);
    return 0;
  }
};

// bootstrap
// -----------------------------------------------------------------------------

/**
 * Reads the scene Excalidraw used to keep in localStorage, so an existing
 * single-canvas install becomes the user's first note session instead of
 * starting them off with an empty one.
 */
const migrateLegacyScene = async (): Promise<NoteSessionMeta | null> => {
  let savedElements: string | null = null;
  let savedState: string | null = null;
  try {
    savedElements = localStorage.getItem(
      STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_ELEMENTS,
    );
    savedState = localStorage.getItem(
      STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_APP_STATE,
    );
  } catch (error: any) {
    console.error(error);
    return null;
  }

  if (!savedElements && !savedState) {
    return null;
  }

  let elements: ExcalidrawElement[] = [];
  let appState: PersistedAppState | null = null;
  try {
    if (savedElements) {
      const parsed = JSON.parse(savedElements);
      if (Array.isArray(parsed)) {
        elements = parsed;
      }
    }
    if (savedState) {
      appState = clearAppStateForLocalStorage(
        JSON.parse(savedState) as Partial<AppState>,
      );
    }
  } catch (error: any) {
    console.error(error);
  }

  const session = createNoteSession(
    appState?.name || DEFAULT_NOTE_SESSION_NAME,
  );
  try {
    await set(session.id, { elements, appState }, scenesStore);
  } catch (error: any) {
    console.error(error);
    return session;
  }

  // only drop the legacy keys once the scene is safely in indexedDB
  try {
    localStorage.removeItem(STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_ELEMENTS);
    localStorage.removeItem(STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_APP_STATE);
  } catch (error: any) {
    console.error(error);
  }

  return session;
};

/**
 * Resolves the session to open on load, creating or migrating one as needed.
 * Always returns a session — the app is never in a state with none.
 */
export const initializeNoteSessions = async (): Promise<NoteSessionMeta> => {
  let sessions = loadNoteSessions();

  if (!sessions.length) {
    const session = (await migrateLegacyScene()) ?? createNoteSession();
    setActiveNoteSessionId(session.id);
    return session;
  }

  const activeId = getActiveNoteSessionId();
  const active = sessions.find((session) => session.id === activeId);
  if (active) {
    return active;
  }

  // stale or missing pointer (e.g. the active session was deleted in another
  // tab) — fall back to the most recently updated one
  sessions = sortSessions(sessions);
  setActiveNoteSessionId(sessions[0].id);
  return sessions[0];
};

/** appState for a session that has never been saved */
export const getInitialNoteSessionAppState = (
  session: NoteSessionMeta,
): Partial<AppState> => ({
  ...getDefaultAppState(),
  name: session.name,
});
