export interface HistoryItem {
  id: number;
  contentType: string;
  content: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  pinned: boolean;
  isPrivate: boolean;
  tags: string[];
  metadata: Record<string, string[]>;
}

export interface IngestResult {
  accepted: boolean;
  itemId: number | null;
  deduped: boolean;
  tags: string[];
  metadata: Record<string, string[]>;
  droppedBy?: string;
  reason?: string;
}
