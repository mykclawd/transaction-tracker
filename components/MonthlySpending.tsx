"use client";

import { Transaction } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface MonthlySpendingProps {
  transactions: Transaction[];
}

const chartConfig = {
  total: {
    label: "Total Spent",
    color: "hsl(221, 83%, 53%)",
  },
} satisfies ChartConfig;

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
      <CardContent className="space-y-6 overflow-hidden">
        <ChartContainer config={chartConfig} className="h-[220px] sm:h-[280px] w-full max-w-full">
          <BarChart data={data} margin={{ left: -10, right: 10 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => `$${value}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Spent</span>
                        <span className="font-mono font-medium">
                          ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Transactions</span>
                        <span className="font-mono font-medium">{item.payload.count}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">BTC Rewards</span>
                        <span className="font-mono font-medium">
                          ${Number(item.payload.btcRewards).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}
                />
              }
            />
            <Bar
              dataKey="total"
              fill="var(--color-total)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>

        <div className="grid gap-4 md:grid-cols-3">
          {data.slice().reverse().slice(0, 6).map((month) => (
            <Card key={month.month}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{month.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Spent</span>
                  <span className="font-medium">${(Number(month.total) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Transactions</span>
                  <span className="font-medium">{month.count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">BTC Rewards</span>
                  <span className="font-medium">
                    ${(Number(month.btcRewards) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Avg per Transaction</span>
                  <span className="font-medium">
                    ${month.count > 0 ? ((Number(month.total) || 0) / month.count).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {data.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No monthly data available. Upload a video to see your spending by month.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
