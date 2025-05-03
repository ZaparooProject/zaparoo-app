import React, { useEffect } from "react";
import { App, URLOpenListenerEvent } from "@capacitor/app";
import { useStatusStore } from "./store";

const AppUrlListener: React.FC = () => {
  const setRunQueue = useStatusStore((state) => state.setRunQueue);
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);

  useEffect(() => {
    App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      const url = new URL(event.url);
      const path = url.pathname;
      const params = new URLSearchParams(url.search);
      const queryParams = Object.fromEntries(params.entries());
      const data = {
        path,
        queryParams
      };
      console.log("App URL opened:", data);

      if (path === "/run") {
        console.log("Run queue:", queryParams.v);
        setRunQueue({ value: queryParams.v, unsafe: true });
      } else if (path === "/write") {
        console.log("Write queue:", queryParams.v);
        setWriteQueue(queryParams.v);
      }
    });
  }, [setRunQueue, setWriteQueue]);

  return null;
};

export default AppUrlListener;
