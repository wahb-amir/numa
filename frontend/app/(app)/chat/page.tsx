import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chat — Numa" };

export default function ChatPage() {
  // The chat layout (chat/layout.tsx) mounts the client ChatRouteShell,
  // which reads ?session=, fetches profile / session data, and renders
  // the chat history rail + greeting/thread. This page is a thin
  // anchor so the route exists; the heavy lifting is in the layout.
  return null;
}