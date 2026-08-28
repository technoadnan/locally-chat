import { Excalidraw } from "../..";
import { UI } from "../../tests/helpers/ui";
import { act, render } from "../../tests/test-utils";

describe("FontPicker", () => {
  it("should be able to open font picker", async () => {
    (global as any).ResizeObserver =
      (global as any).ResizeObserver ||
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };

    const { queryByTestId } = await render(
      <Excalidraw handleKeyboardGlobally={true} />,
    );

    // the keyboard shortcut activates the tool but leaves the styles panel
    // closed, so open it the way a double-click on the tool button does
    UI.clickToolWithStyles("text");

    const fontPickerTrigger = queryByTestId("font-family-show-fonts");

    expect(fontPickerTrigger).not.toBeNull();

    act(() => {
      fontPickerTrigger!.click();
    });
  });
});
