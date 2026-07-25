import { eveChannel } from "eve/channels/eve";
import { localDev, type AuthFn } from "eve/channels/auth";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Accepts the browser's Supabase session cookie (anonymous or signed-in) as the eve caller. */
function supabaseSession(): AuthFn<Request> {
  return async (request) => {
    if (!url || !anonKey) return null;
    const cookies = parseCookieHeader(request.headers.get("cookie") ?? "");
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => cookies,
        setAll: () => {},
      },
    });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const attributes: Record<string, string> = {};
    if (data.user.email) attributes.email = data.user.email;
    return {
      attributes,
      authenticator: "supabase",
      principalId: data.user.id,
      principalType: data.user.is_anonymous ? "anonymous-user" : "user",
    };
  };
}

export default eveChannel({
  auth: [supabaseSession(), localDev()],
});
