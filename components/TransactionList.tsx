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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Search, Plus } from "lucide-react";

interface NewTransactionInput {
  merchant_name: string;
  transaction_date: string;
  amount_spent: number;
  bitcoin_rewards: number;
  category: string | null;
}

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onUpdateCategory: (id: string, category: string | null) => void;
  onAddTransaction?: (transaction: NewTransactionInput) => Promise<void>;
  merchantCategories?: Record<string, string>;
}

export function TransactionList({
  transactions,
  onDelete,
  onUpdateCategory,
  onAddTransaction,
  merchantCategories = {},
}: TransactionListProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "merchant">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state for new transaction
  const [newTransaction, setNewTransaction] = useState({
    merchant_name: "",
    transaction_date: new Date().toISOString().split("T")[0],
    amount_spent: "",
    bitcoin_rewards: "0",
    category: "",
  });

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

  const handleAddTransaction = async () => {
    if (!onAddTransaction || !newTransaction.merchant_name || !newTransaction.amount_spent) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddTransaction({
        merchant_name: newTransaction.merchant_name,
        transaction_date: newTransaction.transaction_date,
        amount_spent: parseFloat(newTransaction.amount_spent),
        bitcoin_rewards: parseFloat(newTransaction.bitcoin_rewards) || 0,
        category: newTransaction.category || null,
      });
      
      // Reset form and close dialog
      setNewTransaction({
        merchant_name: "",
        transaction_date: new Date().toISOString().split("T")[0],
        amount_spent: "",
        bitcoin_rewards: "0",
        category: "",
      });
      setIsAddDialogOpen(false);
    } catch (err) {
      console.error("Failed to add transaction:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Buttons row - first on mobile */}
        <div className="flex items-center gap-2 order-1 sm:order-2 sm:flex-shrink-0">
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as "date" | "amount" | "merchant")}
          >
            <SelectTrigger className="w-32 sm:w-40">
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
        
        {onAddTransaction && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Transaction
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Transaction</DialogTitle>
                <DialogDescription>
                  Manually add a transaction that wasn't captured from the video.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="merchant">Merchant Name *</Label>
                  <Input
                    id="merchant"
                    placeholder="e.g., Starbucks"
                    value={newTransaction.merchant_name}
                    onChange={(e) =>
                      setNewTransaction({ ...newTransaction, merchant_name: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="date">Transaction Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={newTransaction.transaction_date}
                    onChange={(e) =>
                      setNewTransaction({ ...newTransaction, transaction_date: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Amount ($) *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={newTransaction.amount_spent}
                      onChange={(e) =>
                        setNewTransaction({ ...newTransaction, amount_spent: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rewards">BTC Rewards ($)</Label>
                    <Input
                      id="rewards"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={newTransaction.bitcoin_rewards}
                      onChange={(e) =>
                        setNewTransaction({ ...newTransaction, bitcoin_rewards: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={newTransaction.category || "uncategorized"}
                    onValueChange={(value) =>
                      setNewTransaction({
                        ...newTransaction,
                        category: value === "uncategorized" ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uncategorized">Uncategorized</SelectItem>
                      {TRANSACTION_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddTransaction}
                  disabled={
                    isSubmitting ||
                    !newTransaction.merchant_name ||
                    !newTransaction.amount_spent
                  }
                >
                  {isSubmitting ? "Adding..." : "Add Transaction"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        </div>
        
        {/* Search bar - second on mobile (appears below buttons) */}
        <div className="relative flex-1 order-2 sm:order-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
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
                  No transactions found. Upload a video or add one manually!
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
                    ${(Number(transaction.amount_spent) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right">
                    ${(Number(transaction.bitcoin_rewards) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
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
                      {merchantCategories[transaction.merchant_name.toLowerCase()] && (
                        <span className="text-xs text-blue-500" title="Category saved for this merchant">
                          💾
                        </span>
                      )}
                    </div>
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
