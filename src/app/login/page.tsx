import { redirect } from "next/navigation";
import { isBootstrapOpen } from "@/server/services/users";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Nobody can sign in until the first administrator exists, so send them to setup.
  if (await isBootstrapOpen()) redirect("/setup");
  return <LoginForm />;
}
