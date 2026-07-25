import { createMemoryState } from "@chat-adapter/state-memory";
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";

export const { bot, channel, send } = chatSdkChannel({
  userName: "Undertone",
  adapters: { whatsapp: createWhatsAppAdapter() },
  // In-memory thread state; fine for a single-instance deploy, but subscriptions and
  // inbound dedupe reset on restart. Swap for a durable Chat SDK state adapter (Redis,
  // Upstash) before running this at real scale.
  state: createMemoryState(),
  streaming: false,
});

function authFor(message: Message) {
  return {
    authenticator: "whatsapp",
    principalId: message.author.userId,
    principalType: "user",
    attributes: {},
  };
}

bot.onNewMention(async (thread: Thread, message: Message) => {
  await thread.subscribe();
  await send(message.text, { thread, auth: authFor(message) });
});

bot.onSubscribedMessage(async (thread: Thread, message: Message) => {
  await send(message.text, { thread, auth: authFor(message) });
});

export default channel;
