import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { isBootstrapOpen } from "@/server/services/users";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Nobody can sign in until the first administrator exists, so send them to setup.
  if (await isBootstrapOpen()) redirect("/setup");
  // Already signed in (e.g. a used sign-in link was reopened): skip the form.
  if (await getSessionUser()) redirect("/projects");
  return <LoginForm />;
}
