export interface VapiConfig {
  apiKey: string;
}

export interface CreateCallParams {
  phoneNumberId: string;
  assistantId: string;
  customerNumber: string;
  assistantOverrides?: {
    variableValues?: Record<string, string>;
    model?: {
      provider?: string;
      model?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    firstMessage?: string;
  };
}

export interface VapiCallResult {
  id: string;
  status: string;
  [key: string]: unknown;
}

export interface VapiCallDetail {
  id: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  duration?: number;
  artifact?: {
    transcript?: string;
    recordingUrl?: string;
    messages?: unknown[];
  };
  analysis?: {
    summary?: string;
    structuredData?: unknown;
    successEvaluation?: string;
  };
  costBreakdown?: unknown;
  [key: string]: unknown;
}

const BASE_URL = "https://api.vapi.ai";

export class VapiChannel {
  private apiKey: string;

  constructor(config: VapiConfig) {
    this.apiKey = config.apiKey;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async createCall(params: CreateCallParams): Promise<VapiCallResult> {
    const body: Record<string, unknown> = {
      assistantId: params.assistantId,
      phoneNumberId: params.phoneNumberId,
      customer: { number: params.customerNumber },
    };
    if (params.assistantOverrides) {
      body.assistantOverrides = params.assistantOverrides;
    }

    const res = await fetch(`${BASE_URL}/call`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`VAPI API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<VapiCallResult>;
  }

  async getCall(callId: string): Promise<VapiCallDetail> {
    const res = await fetch(`${BASE_URL}/call/${callId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`VAPI API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<VapiCallDetail>;
  }

  async updatePhoneNumberServerUrl(
    phoneNumberId: string,
    serverUrl: string,
  ): Promise<void> {
    const res = await fetch(`${BASE_URL}/phone-number/${phoneNumberId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ serverUrl }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`VAPI API error ${res.status}: ${text}`);
    }
  }
}
