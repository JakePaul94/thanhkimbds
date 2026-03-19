export interface ShortMemory {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  getJob(jobId: string): Promise<JobMemory | null>;
  setJob(jobId: string, data: Partial<JobMemory>): Promise<void>;
}

export interface LongMemory {
  upsert(id: string, payload: MemoryPayload): Promise<void>;
  search(query: string, topK?: number): Promise<MemoryResult[]>;
  delete(id: string): Promise<void>;
}

export type PropertyData = {
  id: string;
  title: string;
  price?: string | null;
  area?: string | null;
  address?: string | null;
  district?: string | null;
  description?: string | null;
  contactPhone?: string | null;
  imageUrls?: string[] | null;
  videoUrl?: string | null;
};

export interface JobMemory {
  jobId:          string;
  topic?:         string;
  hook?:          string;
  hashtags?:      string[];
  ideaCategory?:  "tin_tuc" | "san_pham" | "kinh_nghiem";
  researchTopics?: string[];
  researchNews?:  string[];
  caption?:       { facebook: string; zalo: string };
  imageUrls?:     Record<string, string>;
  videoUrl?:      string;
  property?:      PropertyData;  // BĐS từ Qdrant+SQL khi "viết bài về căn X"
  state:          string;
  createdAt:      string;
}

export interface MemoryPayload {
  text:     string;
  metadata: Record<string, unknown>;
  vector?:  number[];
}

export interface MemoryResult {
  id:      string;
  score:   number;
  payload: MemoryPayload;
}
