import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const inviteSchema = z.object({
  email: z.string().email("Valid email required"),
  role: z.enum(["ADMIN", "TRADER", "VIEWER"]),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: workspaceId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify caller is OWNER or ADMIN
    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Only owners and admins can invite members" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, role } = parsed.data;

    // Check if invitation already exists
    const existingInvite = await db.workspaceInvitation.findFirst({
      where: {
        workspaceId,
        email,
        status: "PENDING",
      },
    });
    if (existingInvite) {
      return NextResponse.json(
        { error: "Pending invitation already exists for this email" },
        { status: 409 }
      );
    }

    // Check if user is already a member
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMembership = await db.workspaceMembership.findFirst({
        where: { workspaceId, userId: existingUser.id },
      });
      if (existingMembership) {
        return NextResponse.json(
          { error: "User is already a member of this workspace" },
          { status: 409 }
        );
      }
    }

    const invitation = await db.workspaceInvitation.create({
      data: {
        workspaceId,
        email,
        role,
        invitedById: userId,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    console.error("Failed to create invitation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
