"use client";

import { Transaction } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pie, PieChart, Cell } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

interface CategoryBreakdownProps {
  transactions: Transaction[];
}

const CHART_COLORS = [
  "hsl(221, 83%, 53%)",  // blue
  "hsl(0, 84%, 60%)",    // red
  "hsl(142, 71%, 45%)",  // green
  "hsl(38, 92%, 50%)",   // amber
  "hsl(262, 83%, 58%)",  // purple
  "hsl(330, 81%, 60%)",  // pink
  "hsl(187, 85%, 53%)",  // cyan
  "hsl(84, 65%, 45%)",   // lime
  "hsl(24, 95%, 53%)",   // orange
  "hsl(239, 84%, 67%)",  // indigo
];

export function CategoryBreakdown({ transactions }: CategoryBreakdownProps) {
  // Group by category
  const groupedByCategory = transactions.reduce((acc, t) => {
    const category = t.category || "Uncategorized";
    acc[category] = (acc[category] || 0) + (Number(t.amount_spent) || 0);
    return acc;
  }, {} as Record<string, number>);

  // Convert to array and sort by amount
  const allData = Object.entries(groupedByCategory)
    .map(([name, value]) => ({ name, value, percentage: 0 }))
    .sort((a, b) => b.value - a.value);

  // Calculate percentages
  const total = allData.reduce((sum, item) => sum + item.value, 0);
  allData.forEach((item) => {
    item.percentage = total > 0 ? (item.value / total) * 100 : 0;
  });

  // Top 5 categories for the pie chart, group the rest as "Other"
  const topCategories = allData.slice(0, 5);
  const otherCategories = allData.slice(5);
  
  if (otherCategories.length > 0) {
    const otherTotal = otherCategories.reduce((sum, item) => sum + item.value, 0);
    topCategories.push({
      name: "Other",
      value: otherTotal,
      percentage: (otherTotal / total) * 100,
    });
  }

  // Build chart config dynamically based on categories
  const chartConfig: ChartConfig = topCategories.reduce((config, item, index) => {
    const key = item.name.toLowerCase().replace(/\s+/g, '-');
    config[key] = {
      label: item.name,
      color: CHART_COLORS[index % CHART_COLORS.length],
    };
    return config;
  }, {} as ChartConfig);

  // Transform data for the chart
  const chartData = topCategories.map((item, index) => ({
    category: item.name.toLowerCase().replace(/\s+/g, '-'),
    name: item.name,
    value: item.value,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by Category</CardTitle>
        <CardDescription>Breakdown of where your money goes</CardDescription>
      </CardHeader>
      <CardContent className="overflow-hidden">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[250px] sm:h-[300px] max-w-full">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => (
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: item.payload.fill }}
                      />
                      <span>{item.payload.name}</span>
                      <span className="ml-auto font-mono font-medium">
                        ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              strokeWidth={2}
              stroke="hsl(var(--background))"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <ChartLegend
              content={<ChartLegendContent nameKey="name" />}
              className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/3 [&>*]:justify-center"
            />
          </PieChart>
        </ChartContainer>

        {/* Detailed breakdown table */}
        <div className="mt-4 space-y-2">
          {allData.map((item, index) => (
            <div
              key={item.name}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                  }}
                />
                <span>{item.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">
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
