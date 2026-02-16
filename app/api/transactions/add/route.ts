import { auth } from "@clerk/nextjs/server";
import { pool, generateTransactionId, parseTransactionDate } from "@/lib/db";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { merchant_name, transaction_date, amount_spent, bitcoin_rewards, category } = body;

    if (!merchant_name || !transaction_date || amount_spent === undefined) {
      return Response.json(
        { error: "Missing required fields: merchant_name, transaction_date, amount_spent" },
        { status: 400 }
      );
    }

    // Parse and validate the date
    const formattedDate = parseTransactionDate(transaction_date);
    if (!formattedDate) {
      return Response.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }

    // Generate a unique transaction ID
    const transactionId = generateTransactionId(
      userId,
      merchant_name,
      formattedDate,
      parseFloat(amount_spent),
      parseFloat(bitcoin_rewards) || 0
    );

    // Insert the transaction
    const result = await pool.query(
      `INSERT INTO transactions (id, user_id, merchant_name, transaction_date, amount_spent, bitcoin_rewards, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
      [
        transactionId,
        userId,
        merchant_name,
        formattedDate,
        parseFloat(amount_spent),
        parseFloat(bitcoin_rewards) || 0,
        category || null,
      ]
    );

    if (result.rows.length === 0) {
      return Response.json(
        { error: "Transaction already exists (duplicate)" },
        { status: 409 }
      );
    }

    console.log(`✅ Manually added transaction: ${merchant_name} - $${amount_spent}`);

    return Response.json({
      success: true,
      transaction: result.rows[0],
    });
  } catch (error: any) {
    console.error("Add transaction error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
