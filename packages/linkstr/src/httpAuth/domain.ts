export interface BlossomUploadAuthDraft {
  readonly sha256: string;
  readonly serverDomain: string;
}

export interface PushOwnershipProofDraft {
  readonly action: "subscribe" | "unsubscribe";
  readonly challenge: string;
}

export interface Nip98AuthDraft {
  readonly url: string;
  readonly method: string;
  readonly payload?: Record<string, string>;
}
