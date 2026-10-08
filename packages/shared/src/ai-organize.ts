export type AiOrganizeSection = 'needs' | 'history' | 'reply' | 'unfinished' | 'next';
export type AiOrganizeEvidence = { id: string; at: string; href: string };
export type AiOrganizeSummary = Record<AiOrganizeSection, Array<{
  text: string;
  evidence: AiOrganizeEvidence[];
  replyState: 'reply_needed_candidate' | 'reply_observed' | 'unknown';
  workState: 'unfinished_candidate' | 'completion_reported' | 'unknown';
  needsReview: true;
}>>;
export interface AiOrganizeEstimate {
  conversations: number;
  messages: number;
  moreAvailable: boolean;
  boundedInputTokens: number;
  maxOutputTokensPerCall: number;
  maxAttempts: number;
  estimatedUsd: number;
  reservedUsd: number;
  perJobLimitUsd: number;
  monthlyLimitUsd: number;
  model: string;
  configured: boolean;
  from: string;
  to: string;
}
export interface AiOrganizeJob {
  id: string;
  accountId: string;
  status: 'preview' | 'ready' | 'completed' | 'cancelled';
  expiresAt: string;
  estimate: AiOrganizeEstimate;
  items: Array<{
    id: string;
    friendId: string;
    displayName: string | null;
    status: 'pending' | 'processing' | 'failed' | 'done';
    attempts: number;
    errorCode: string | null;
    chargedUsd: number;
    usage: unknown[];
    summary: AiOrganizeSummary | null;
  }>;
}
