"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoUpload } from "@/components/VideoUpload";
import { TransactionList } from "@/components/TransactionList";
import { SpendingChart } from "@/components/SpendingChart";
import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import { MonthlySpending } from "@/components/MonthlySpending";
import { Transaction } from "@/lib/types";
import { Loader2 } from "lucide-react";

export default function Dashboard() {
  const { userId } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [merchantCategories, setMerchantCategories] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      
      // Fetch transactions and merchant categories in parallel
      const [txResponse, catResponse] = await Promise.all([
        fetch("/api/transactions"),
        fetch("/api/merchant-categories"),
      ]);
      
      if (!txResponse.ok) throw new Error("Failed to fetch transactions");
      
      const txData = await txResponse.json();
      setTransactions(txData.transactions || []);
      
      // Parse merchant categories into a lookup map
      if (catResponse.ok) {
        const catData = await catResponse.json();
        const catMap: Record<string, string> = {};
        catData.categories?.forEach((c: { merchant_name: string; category: string }) => {
          catMap[c.merchant_name.toLowerCase()] = c.category;
        });
        setMerchantCategories(catMap);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleUploadComplete = () => {
    fetchTransactions();
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      const response = await fetch(`/api/transactions/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete transaction");
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleUpdateCategory = async (id: string, category: string | null) => {
    try {
      const response = await fetch(`/api/transactions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!response.ok) throw new Error("Failed to update category");
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, category } : t))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Transactions</CardDescription>
            <CardTitle className="text-3xl">{transactions.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Spent</CardDescription>
            <CardTitle className="text-3xl">
              ${transactions.reduce((sum, t) => sum + (Number(t.amount_spent) || 0), 0).toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total BTC Rewards (USDC)</CardDescription>
            <CardTitle className="text-3xl">
              {transactions.reduce((sum, t) => sum + (Number(t.bitcoin_rewards) || 0), 0).toFixed(8)} USDC
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Transaction</CardDescription>
            <CardTitle className="text-3xl">
              ${transactions.length > 0
                ? (transactions.reduce((sum, t) => sum + (Number(t.amount_spent) || 0), 0) / transactions.length).toFixed(2)
                : "0.00"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <VideoUpload onUploadComplete={handleUploadComplete} />

      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <TransactionList
            transactions={transactions}
            onDelete={handleDeleteTransaction}
            onUpdateCategory={handleUpdateCategory}
            merchantCategories={merchantCategories}
          />
        </TabsContent>

        <TabsContent value="charts" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <SpendingChart transactions={transactions} />
            <CategoryBreakdown transactions={transactions} />
          </div>
        </TabsContent>

        <TabsContent value="monthly">
          <MonthlySpending transactions={transactions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
