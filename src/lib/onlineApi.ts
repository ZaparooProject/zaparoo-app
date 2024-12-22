import axios from "axios";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

const client = axios.create({
  baseURL: "https://api.zaparoo.com"
});

client.interceptors.request.use(async function (config) {
  const token = await FirebaseAuthentication.getIdToken();
  config.headers.Authorization = `Bearer ${token.token}`;
  return config;
});

interface LinkAction {
  name: string;
  value: string;
}

interface LinkResponse {
  id: string;
  claimed: boolean;
  actions: LinkAction[];
}

export const checkLink = async (id: string): Promise<LinkResponse> => {
  const resp = await client.get<LinkResponse>("/links/" + id);
  console.log(resp.data);
  return resp.data;
};

export const claimLink = async (id: string): Promise<LinkResponse> => {
  const resp = await client.post<LinkResponse>("/links/" + id + "/claim");
  return resp.data;
};
