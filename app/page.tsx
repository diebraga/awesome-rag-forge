"use client";

import { FormEvent, useState } from "react";
import { Scale, SendHorizontal } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type ChatMessage = {
  id: number;
  role: "bot" | "user";
  text: string;
};

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "bot",
    text: "Hi. I am your legal bot shell. Ask a question here and, for now, I will echo it back until the model is connected.",
  },
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const question = input.trim();
    if (!question) return;

    const nextId = messages.length + 1;
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: nextId, role: "user", text: question },
      {
        id: nextId + 1,
        role: "bot",
        text: "Model not connected yet. Next step: wire this chatbox to your legal-agent API, RAG search, and local model server.",
      },
    ]);
    setInput("");
  }

  return (
    <main className="min-h-screen bg-[#f5f2ec] px-4 py-8 text-foreground">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl items-center justify-center">
        <Card className="w-full gap-0 rounded-2xl border-[#ddd6c9] bg-white py-0 shadow-[0_24px_80px_rgba(25,24,22,0.12)]">
          <CardHeader className="px-6 py-5">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#8a5a2b]">
              <Scale className="size-4" />
              Legal Bot
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Ask the robot
            </CardTitle>
            <CardDescription className="max-w-xl leading-6">
              Frontend-only chat shell. The model, RAG, and harness will be
              connected in the next pass.
            </CardDescription>
          </CardHeader>

          <Separator />

          <CardContent className="p-0">
            <ScrollArea className="h-[480px] px-6 py-6">
              <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-end gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "bot" && (
                    <Avatar size="sm">
                      <AvatarFallback className="bg-[#191816] text-white">
                        LB
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[82%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground"
                        : "max-w-[82%] rounded-2xl rounded-bl-md border bg-muted px-4 py-3 text-sm leading-6 text-foreground"
                    }
                  >
                    {message.text}
                  </div>
                  {message.role === "user" && (
                    <Avatar size="sm">
                      <AvatarFallback>You</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              </div>
            </ScrollArea>
          </CardContent>

          <CardFooter className="rounded-b-2xl border-t border-[#ebe5da] bg-[#fbfaf7] p-4">
            <form
              onSubmit={handleSubmit}
              className="flex w-full gap-3"
            >
              <label className="sr-only" htmlFor="message">
                Message
              </label>
              <Input
                id="message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask a legal question..."
                className="h-12 flex-1 rounded-xl bg-white px-4"
              />
              <Button
                type="submit"
                size="lg"
                className="h-12 rounded-xl px-5"
              >
                Send
                <SendHorizontal data-icon="inline-end" className="size-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      </section>
    </main>
  );
}
