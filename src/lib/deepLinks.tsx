import React, { useEffect } from "react";
import { App, URLOpenListenerEvent } from "@capacitor/app";
import { useStatusStore } from "./store";
import { logger } from "./logger";

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
        queryParams,
      };
      logger.log("App URL opened:", data);

      if (path === "/run" && queryParams.v) {
        logger.log("Run queue:", queryParams.v);
        setRunQueue({ value: queryParams.v, unsafe: true });
      } else if (path === "/write" && queryParams.v) {
        logger.log("Write queue:", queryParams.v);
        setWriteQueue(queryParams.v);
      }
    });
  }, [setRunQueue, setWriteQueue]);

  return null;
};

export default AppUrlListener;
