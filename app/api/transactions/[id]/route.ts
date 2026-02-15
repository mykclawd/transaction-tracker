import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { pool, setUserMerchantCategory } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { category } = await request.json();
    const { id } = await params;

    // Verify ownership and get merchant name
    const checkResult = await pool.query(
      "SELECT user_id, merchant_name FROM transactions WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    if (checkResult.rows[0].user_id !== userId) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Update the transaction
    await pool.query(
      "UPDATE transactions SET category = $1 WHERE id = $2",
      [category, id]
    );

    // If category is set (not null), save as user's preferred category for this merchant
    // This is user-specific and won't affect other users
    if (category) {
      await setUserMerchantCategory(userId, checkResult.rows[0].merchant_name, category, 'manual');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating transaction:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Verify ownership
    const checkResult = await pool.query(
      "SELECT user_id FROM transactions WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    if (checkResult.rows[0].user_id !== userId) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    await pool.query("DELETE FROM transactions WHERE id = $1", [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
