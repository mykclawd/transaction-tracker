"use client";

import { Transaction } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MonthlySpendingProps {
  transactions: Transaction[];
}

export function MonthlySpending({ transactions }: MonthlySpendingProps) {
  // Group transactions by month
  const groupedByMonth = transactions.reduce((acc, t) => {
    const date = new Date(t.transaction_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });

    if (!acc[monthKey]) {
      acc[monthKey] = { label: monthLabel, total: 0, count: 0, btcRewards: 0 };
    }
    acc[monthKey].total += Number(t.amount_spent) || 0;
    acc[monthKey].count += 1;
    acc[monthKey].btcRewards += Number(t.bitcoin_rewards) || 0;

    return acc;
  }, {} as Record<string, { label: string; total: number; count: number; btcRewards: number }>);

  // Convert to array and sort by month
  const data = Object.entries(groupedByMonth)
    .map(([key, value]) => ({ month: key, ...value }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Spending</CardTitle>
        <CardDescription>Transaction totals by month</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip
                formatter={(value, name) => {
                  if (name === "total") return [typeof value === 'number' ? `$${value.toFixed(2)}` : value, "Spent"];
                  if (name === "btcRewards") return [typeof value === 'number' ? value.toFixed(8) : value, "BTC Rewards"];
                  return [value, name];
                }}
                contentStyle={{ borderRadius: "8px" }}
              />
              <Bar dataKey="total" fill="#3b82f6" name="Total Spent" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {data.slice().reverse().slice(0, 6).map((month) => (
            <Card key={month.month}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{month.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500">Total Spent</span>
                  <span className="font-medium">${(Number(month.total) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500">Transactions</span>
                  <span className="font-medium">{month.count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500">BTC Rewards</span>
                  <span className="font-medium font-mono text-xs">
                    {(Number(month.btcRewards) || 0).toFixed(8)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500">Avg per Transaction</span>
                  <span className="font-medium">
                    ${month.count > 0 ? ((Number(month.total) || 0) / month.count).toFixed(2) : "0.00"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {data.length === 0 && (
          <div className="text-center py-8 text-zinc-500">
            No monthly data available. Upload a video to see your spending by month.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
