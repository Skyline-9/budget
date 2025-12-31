import { API_MODE } from "@/api/config";
import type { ApiClient } from "@/api/types";
import { mockApiClient } from "@/api/mock/client";
import { realApiClient } from "@/api/real/client";

export const api: ApiClient = API_MODE === "real" ? realApiClient : mockApiClient;










