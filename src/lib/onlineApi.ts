import axios from "axios";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

const client = axios.create({
  baseURL: "https://api.zaparoo.com/v1",
});

client.interceptors.request.use(async function (config) {
  const token = await FirebaseAuthentication.getIdToken();
  config.headers.Authorization = `Bearer ${token.token}`;
  return config;
});

if (import.meta.env.DEV) {
  client.interceptors.request.use((config) => {
    console.log("Request", config);
    return config;
  });
  client.interceptors.response.use((res) => {
    console.log("Response", res);
    return res;
  });
}
