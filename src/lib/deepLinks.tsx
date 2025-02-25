import React, { useEffect } from "react";
import { App, URLOpenListenerEvent } from "@capacitor/app";

const AppUrlListener: React.FC = () => {
  useEffect(() => {
    App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      const url = event.url;
      console.log("got url: " + url);
    });
  }, []);

  return null;
};

export default AppUrlListener;
