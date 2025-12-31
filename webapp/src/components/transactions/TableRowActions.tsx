import React from "react";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useCreateTransactionMutation, useDeleteTransactionMutation } from "@/api/queries";
import type { Transaction } from "@/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Props = {
  transaction: Transaction;
  onEdit?: () => void;
};

export function TableRowActions({ transaction, onEdit }: Props) {
  const createTxn = useCreateTransactionMutation();
  const deleteTxn = useDeleteTransactionMutation();

  const busy = createTxn.isPending || deleteTxn.isPending;

  async function handleDuplicate() {
    await createTxn.mutateAsync({
      date: transaction.date,
      categoryId: transaction.categoryId,
      amountCents: transaction.amountCents,
      merchant: transaction.merchant,
      notes: transaction.notes,
    });
  }

  async function handleDelete() {
    if (!confirm("Delete this transaction?")) return;
    await deleteTxn.mutateAsync({ id: transaction.id, transaction });
  }

  return (
    <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
      {onEdit && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={busy} onClick={handleDuplicate}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onClick={handleDelete} className="text-danger">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
