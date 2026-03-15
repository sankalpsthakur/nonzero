import { redirect } from "next/navigation";

// Google OAuth handles both signup and login.
// Redirect to login so there's a single entry point.
export default function SignupPage() {
  redirect("/login");
}
