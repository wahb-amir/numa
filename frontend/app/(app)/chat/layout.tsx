import { ChatRouteShell } from "@/components/chat/chat-route-shell";
import { ContextDrawer } from "@/components/chat/context-drawer";

export default function ChatRouteLayout() {
  return (
    <>
      <ContextDrawer />
      <ChatRouteShell />
    </>
  );
}
