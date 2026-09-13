import axios, { type InternalAxiosRequestConfig } from "axios";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { useRequirementsStore } from "@/hooks/useRequirementsModal";
import { useStatusStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import { RequirementsNotMetError } from "@/lib/errors";
import type {
  RequirementsResponse,
  UpdateRequirementsRequest,
  PendingRequirement,
  DeleteAccountResponse,
  DeviceClaimResponse,
  SubscriptionResponse,
} from "@/lib/models";

export class NotSignedInError extends Error {
  constructor() {
    super("User is not signed in");
    this.name = "NotSignedInError";
  }
}

const client = axios.create({
  baseURL: "https://api.zaparoo.com/v1",
});

export async function authRequestInterceptor(
  config: InternalAxiosRequestConfig,
) {
  const { user } = await FirebaseAuthentication.getCurrentUser();
  if (!user) {
    const state = useStatusStore.getState();
    if (state.loggedInUser !== null) {
      state.setLoggedInUser(null);
    }
    throw new NotSignedInError();
  }
  const token = await FirebaseAuthentication.getIdToken();
  config.headers.Authorization = `Bearer ${token.token}`;
  return config;
}

client.interceptors.request.use(authRequestInterceptor);

// Response interceptor to catch requirements_not_met errors
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = error.response?.data?.error;
    if (apiError?.code !== "requirements_not_met") {
      return Promise.reject(error);
    }

    const requirements: PendingRequirement[] = Array.isArray(
      apiError.requirements,
    )
      ? apiError.requirements
      : [];
    if (requirements.length > 0) {
      useRequirementsStore.getState().trigger(requirements);
    }

    // A typed rejection lets callers treat this expected account state as
    // handled by the requirements modal instead of reporting a raw 403.
    return Promise.reject(new RequirementsNotMetError(requirements, error));
  },
);

if (import.meta.env.DEV) {
  client.interceptors.request.use((config) => {
    logger.debug("Online API request", {
      method: config.method,
      url: config.url,
    });
    return config;
  });
  client.interceptors.response.use((res) => {
    logger.debug("Online API response", {
      method: res.config.method,
      url: res.config.url,
      status: res.status,
    });
    return res;
  });
}

export const onlineApi = client;

export async function getSubscriptionStatus(
  signal?: AbortSignal,
): Promise<SubscriptionResponse> {
  const response = signal
    ? await client.get<SubscriptionResponse>("/account/subscription", {
        signal,
      })
    : await client.get<SubscriptionResponse>("/account/subscription");
  return response.data;
}

export async function createDeviceClaim(
  signal?: AbortSignal,
): Promise<DeviceClaimResponse> {
  const response = await client.post<DeviceClaimResponse>(
    "/device-claims",
    { source: "app" },
    signal ? { signal } : undefined,
  );
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
