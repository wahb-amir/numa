import { TopHeader } from "@/components/shell/top-header";
import { ContextDrawer } from "@/components/chat/context-drawer";
import { ChatInterface } from "@/components/chat/chat-interface";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chat — Numa" };

export default function ChatPage() {
  return (
    <div>
      <TopHeader title="Chat" subtitle="Ask Numa about your data" />
      <ContextDrawer />
      <ChatInterface />
    </div>
  );
}
