import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatWorkspace } from "@/components/chat-workspace";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: rooms, error } = await supabase.from("chat_rooms")
    .select("id,title,created_at,updated_at").order("updated_at", { ascending: false });
  return <ChatWorkspace
    profile={{ name: user.user_metadata.full_name || user.user_metadata.name || "사용자", avatar: user.user_metadata.avatar_url || "" }}
    initialRooms={rooms ?? []}
    initialError={error ? "대화 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요." : ""}
  />;
}
