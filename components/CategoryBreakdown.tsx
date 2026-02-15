"use client";

import { Transaction } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface CategoryBreakdownProps {
  transactions: Transaction[];
}

const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

export function CategoryBreakdown({ transactions }: CategoryBreakdownProps) {
  // Group by category
  const groupedByCategory = transactions.reduce((acc, t) => {
    const category = t.category || "Uncategorized";
    acc[category] = (acc[category] || 0) + (Number(t.amount_spent) || 0);
    return acc;
  }, {} as Record<string, number>);

  // Convert to array and sort by amount
  const data = Object.entries(groupedByCategory)
    .map(([name, value]) => ({ name, value, percentage: 0 }))
    .sort((a, b) => b.value - a.value);

  // Calculate percentages
  const total = data.reduce((sum, item) => sum + item.value, 0);
  data.forEach((item) => {
    item.percentage = total > 0 ? (item.value / total) * 100 : 0;
  });

  // Top 5 categories for the pie chart, group the rest as "Other"
  const topCategories = data.slice(0, 5);
  const otherCategories = data.slice(5);
  
  if (otherCategories.length > 0) {
    const otherTotal = otherCategories.reduce((sum, item) => sum + item.value, 0);
    topCategories.push({
      name: "Other",
      value: otherTotal,
      percentage: (otherTotal / total) * 100,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by Category</CardTitle>
        <CardDescription>Breakdown of where your money goes</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={topCategories}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(props) => {
                  const { name, value } = props;
                  const total = topCategories.reduce((sum, item) => sum + item.value, 0);
                  const pct = total > 0 ? ((value as number) / total) * 100 : 0;
                  return `${name}: ${pct.toFixed(1)}%`;
                }}
                outerRadius={70}
                fill="#8884d8"
                dataKey="value"
              >
                {topCategories.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [
                  typeof value === 'number' ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : value,
                  name,
                ]}
                contentStyle={{ borderRadius: "8px" }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Detailed breakdown table */}
        <div className="mt-6 space-y-2">
          {data.map((item, index) => (
            <div
              key={item.name}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{
                    backgroundColor:
                      COLORS[index % COLORS.length],
                  }}
                />
                <span>{item.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-zinc-500">
                  {(Number(item.percentage) || 0).toFixed(1)}%
                </span>
                <span className="font-medium">
                  ${(Number(item.value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
