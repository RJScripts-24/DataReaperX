export type SleuthEvent =
  | {
      event: "stage_complete";
      payload: {
        stage: string;
        platform?: string;
        username?: string;
        usernames?: string[];
        count?: number;
        emails?: string[];
        broker_names?: string[];
        broker_name?: string;
        summary?: boolean;
        angle?: number;
        distance?: number;
      };
    }
  | {
      event: "exposure_found";
      payload: {
        broker_name: string;
        data_types: string[];
        priority_score: number;
        angle: number;
        distance: number;
      };
    }
  | {
      event: "broker_contacted";
      payload: {
        broker_name: string;
        legal_framework: string;
        status: string;
      };
    }
  | {
      event: "deletion_confirmed";
      payload: {
        broker_name: string;
      };
    }
  | {
      event: "agent_status_change";
      payload: {
        agent: string;
        status: string;
        detail: string;
      };
    }
  | {
      event: "captcha_block";
      payload: {
        broker: string;
        type: string;
      };
    }
  | {
      event: "agent_resumed";
      payload: Record<string, never>;
    }
  | {
      event: "scan_stopped";
      payload: {
        status: string;
        current_stage: string;
        reason: string;
      };
    }
  | {
      event: "scan_lifecycle_updated";
      payload: {
        status: string;
        current_stage?: string;
        reason?: string;
      };
    };

export type AgentEvent =
  | { event: "captcha_block"; broker: string; type: string }
  | { event: "agent_resumed" }
  | { event: "threat_found"; broker: string; data: Record<string, unknown> }
  | { event: "request_sent"; broker: string; legal_framework: string }
  | { event: "email_reply"; broker: string; intent: "success" | "stall" | "illegal" };
