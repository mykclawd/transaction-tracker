"use client";

import { useState } from "react";
import { Transaction } from "@/lib/types";
import { TRANSACTION_CATEGORIES } from "@/lib/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Search } from "lucide-react";

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onUpdateCategory: (id: string, category: string | null) => void;
}

export function TransactionList({
  transactions,
  onDelete,
  onUpdateCategory,
}: TransactionListProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "merchant">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const filteredTransactions = transactions
    .filter(
      (t) =>
        t.merchant_name.toLowerCase().includes(search.toLowerCase()) ||
        (t.category?.toLowerCase() || "").includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "date":
          comparison = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
          break;
        case "amount":
          comparison = a.amount_spent - b.amount_spent;
          break;
        case "merchant":
          comparison = a.merchant_name.localeCompare(b.merchant_name);
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as "date" | "amount" | "merchant")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="amount">Amount</SelectItem>
            <SelectItem value="merchant">Merchant</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
        >
          {sortOrder === "asc" ? "↑ Asc" : "↓ Desc"}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merchant</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>BTC Rewards</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-zinc-500">
                  No transactions found. Upload a video to get started!
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">
                    {transaction.merchant_name}
                  </TableCell>
                  <TableCell>
                    {new Date(transaction.transaction_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    ${(Number(transaction.amount_spent) || 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {(Number(transaction.bitcoin_rewards) || 0).toFixed(8)}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={transaction.category || "uncategorized"}
                      onValueChange={(value) =>
                        onUpdateCategory(
                          transaction.id,
                          value === "uncategorized" ? null : value
                        )
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uncategorized">
                          Uncategorized
                        </SelectItem>
                        {TRANSACTION_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(transaction.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-zinc-500">
        Showing {filteredTransactions.length} of {transactions.length} transactions
      </div>
    </div>
  );
}
