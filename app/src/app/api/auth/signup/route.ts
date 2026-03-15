import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import {
  hashPassword,
  createSession,
  COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from "@/lib/auth";

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(100),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { email, password, name } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already taken
    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Create user, workspace, membership, and credit accounts in a transaction
    const result = await db.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name,
          passwordHash,
        },
      });

      // Generate a workspace slug from the user's name
      const baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const slug = `${baseSlug}-lab`;

      // Create default SOLO_LAB workspace
      const workspace = await tx.workspace.create({
        data: {
          name: `${name}'s Lab`,
          slug,
          type: "SOLO_LAB",
        },
      });

      // Add user as OWNER
      await tx.workspaceMembership.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: "OWNER",
        },
      });

      // Create starter credit accounts
      await tx.creditAccount.createMany({
        data: [
          { workspaceId: workspace.id, bucket: "TESTING", balance: 1000 },
          { workspaceId: workspace.id, bucket: "LIVE_OPS", balance: 0 },
        ],
      });

      // Create onboarding checklist
      await tx.onboardingChecklist.create({
        data: {
          workspaceId: workspace.id,
          workspaceCreated: true,
        },
      });

      return { user, workspace };
    });

    // Create session
    const token = await createSession(result.user.id);

    // Build response
    const response = NextResponse.json(
      {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        },
        workspace: {
          id: result.workspace.id,
          slug: result.workspace.slug,
        },
      },
      { status: 201 },
    );

    // Set session cookie
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000, // maxAge is in seconds
    });

    return response;
  } catch (error) {
    console.error("Signup failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
