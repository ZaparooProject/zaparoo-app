import axios from "axios";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { useRequirementsStore } from "@/hooks/useRequirementsModal";
import type {
  RequirementsResponse,
  UpdateRequirementsRequest,
  PendingRequirement,
  DeleteAccountResponse,
} from "@/lib/models";

const client = axios.create({
  baseURL: "https://api.zaparoo.com/v1",
});

client.interceptors.request.use(async function (config) {
  const token = await FirebaseAuthentication.getIdToken();
  config.headers.Authorization = `Bearer ${token.token}`;
  return config;
});

// Response interceptor to catch requirements_not_met errors
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorCode = error.response?.data?.error?.code;
    const requirements = error.response?.data?.error
      ?.requirements as PendingRequirement[];

    if (errorCode === "requirements_not_met" && requirements?.length > 0) {
      useRequirementsStore.getState().trigger(requirements);
    }

    return Promise.reject(error);
  },
);

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

export const onlineApi = client;

export async function getSubscriptionStatus(): Promise<{
  is_premium: boolean;
}> {
  const response = await client.get("/account/subscription");
  return response.data;
}

export async function getRequirements(): Promise<RequirementsResponse> {
  const response = await client.get("/account/requirements");
  return response.data;
}

export async function updateRequirements(
  req: UpdateRequirementsRequest,
): Promise<RequirementsResponse> {
  const response = await client.post("/account/requirements", req);
  return response.data;
}

export async function deleteAccount(
  confirmation: string,
): Promise<DeleteAccountResponse> {
  const response = await client.delete("/account", {
    data: { confirmation },
  });
  return response.data;
}

export async function cancelAccountDeletion(): Promise<{ message: string }> {
  const response = await client.post("/account/cancel-deletion");
  return response.data;
}
