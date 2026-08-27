import { getDefaultAppState } from "@excalidraw/excalidraw/appState";

import { STORAGE_KEYS } from "../app_constants";

import {
  getActiveNoteSessionId,
  getAllNoteSessionsStorageSize,
  getNoteSessionStorageSize,
  loadNoteSessionScene,
} from "./noteSessions";

import type { NoteSessionMeta } from "./noteSessions";

export const saveUsernameToLocalStorage = (username: string) => {
  try {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_COLLAB,
      JSON.stringify({ username }),
    );
  } catch (error: any) {
    // Unable to access window.localStorage
    console.error(error);
  }
};

export const importUsernameFromLocalStorage = (): string | null => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_COLLAB);
    if (data) {
      return JSON.parse(data).username;
    }
  } catch (error: any) {
    // Unable to access localStorage
    console.error(error);
  }

  return null;
};

/**
 * Loads the scene of a note session. Replaces upstream's
 * `importFromLocalStorage`, which could only ever read the one scene the app
 * kept under a fixed localStorage key.
 */
export const importNoteSessionFromStorage = async (
  session: NoteSessionMeta,
) => {
  const { elements, appState } = await loadNoteSessionScene(session.id);

  return {
    elements,
    appState: {
      ...getDefaultAppState(),
      ...appState,
      // the sessions list is the source of truth for the name, so a rename
      // made while this session was closed wins over the stored appState
      name: session.name,
    },
  };
};

export const getElementsStorageSize = async () => {
  const activeId = getActiveNoteSessionId();
  return activeId ? getNoteSessionStorageSize(activeId) : 0;
};

export const getTotalStorageSize = async () => {
  let collabSize = 0;
  try {
    collabSize =
      localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_COLLAB)?.length || 0;
  } catch (error: any) {
    console.error(error);
  }

  return collabSize + (await getAllNoteSessionsStorageSize());
};
