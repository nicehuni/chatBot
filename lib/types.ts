export type Source = { type: "document" | "web"; title: string; url?: string; page?: number; excerpt?: string };
export type Room = { id: string; title: string; created_at: string; updated_at: string };
export type Turn = {
  id: string;
  room_id: string;
  question: string;
  answer: string | null;
  sources: Source[];
  status: "pending" | "completed" | "failed";
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};
