import React, { useEffect } from "react";
import { App, URLOpenListenerEvent } from "@capacitor/app";

const AppUrlListener: React.FC = () => {
  useEffect(() => {
    App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      const url = event.url;
      let id = "";

      if (url.includes("://go.tapto.life/")) {
        id = url.replace(/https?:\/\/go.tapto.life\//, "");
      } else if (url.includes("://zpr.au/")) {
        id = url.replace(/https?:\/\/zpr.au\//, "");
      }

      if (id.length !== 20) {
        return;
      }

      console.log("got zap link id: " + id);
    });
  }, []);

  return null;
};

export default AppUrlListener;
