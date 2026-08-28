import type { UIAppState } from "@excalidraw/excalidraw/types";

import { getSelectedElements } from "./selection";

import type { NonDeletedExcalidrawElement } from "./types";

/**
 * Whether the styles panel should be rendered.
 *
 * Two independent reasons to show it:
 *
 * - elements are selected — you're styling those, so the panel always follows
 *   the selection;
 * - a drawing tool is active *and* its panel was explicitly opened by
 *   double-clicking the tool's button (`stylesPanelOpen`). A single click
 *   activates the tool with its current settings and leaves the panel closed.
 *
 * Text editing is exempt from the double-click requirement: the font controls
 * are the only way to restyle text while the cursor is in it.
 */
export const showSelectedShapeActions = (
  appState: UIAppState,
  elements: readonly NonDeletedExcalidrawElement[],
) =>
  Boolean(
    !appState.viewModeEnabled &&
      appState.openDialog?.name !== "elementLinkSelector" &&
      ((appState.activeTool.type !== "custom" &&
        (appState.editingTextElement ||
          (appState.stylesPanelOpen &&
            appState.activeTool.type !== "selection" &&
            appState.activeTool.type !== "lasso" &&
            appState.activeTool.type !== "eraser" &&
            appState.activeTool.type !== "hand" &&
            appState.activeTool.type !== "laser"))) ||
        getSelectedElements(elements, appState).length),
  );
