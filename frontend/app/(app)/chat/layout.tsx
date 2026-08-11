import { ChatRouteShell } from "@/components/chat/chat-route-shell";

/**
 * The chat route mounts ChatRouteShell, which owns the header (with
 * its inline "Using" chip strip), the history rail, and the thread
 * section. This layout is intentionally thin so that the chat URL
 * exists as a route while every chrome decision lives in one place.
 */
export default function ChatRouteLayout() {
  return <ChatRouteShell />;
}