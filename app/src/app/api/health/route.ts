import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await db.$queryRawUnsafe("SELECT 1");
    checks.database = "ok";
  } catch {
    checks.database = "failed";
    healthy = false;
  }

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      checks,
    },
    { status: healthy ? 200 : 503 }
  );
}
