import axios from "axios";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

const client = axios.create({
  baseURL: "https://api.zaparoo.com/v1"
});

client.interceptors.request.use(async function (config) {
  const token = await FirebaseAuthentication.getIdToken();
  config.headers.Authorization = `Bearer ${token.token}`;
  return config;
});

