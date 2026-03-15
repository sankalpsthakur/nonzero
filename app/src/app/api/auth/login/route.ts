import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/auth";

// Login is handled by Google OAuth — redirect to the Google consent screen.

export async function GET() {
  return NextResponse.redirect(getGoogleAuthUrl());
}

// Keep POST for backwards-compat: any old form submissions just get redirected.
export async function POST() {
  return NextResponse.redirect(getGoogleAuthUrl());
}
