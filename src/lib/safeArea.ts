import { SafeArea } from "capacitor-plugin-safe-area";

export var safeAreaTopPx = "0px";
export var safeAreaBottomPx = "0px";
export var safeAreaLeftPx = "0px";
export var safeAreaRightPx = "0px";

export const initSafeArea = () =>
  SafeArea.setImmersiveNavigationBar().then(() => {
    SafeArea.getSafeAreaInsets().then(({ insets }) => {
      console.debug(
        "insets:",
        insets.bottom,
        insets.top,
        insets.left,
        insets.right
      );
      safeAreaTopPx = `${insets.top}px`;
      safeAreaBottomPx = `${insets.bottom}px`;
      safeAreaLeftPx = `${insets.left}px`;
      safeAreaRightPx = `${insets.right}px`;
    });
  });
