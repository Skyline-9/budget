import * as React from "react";
import type { Transaction } from "@/types";

export type TransactionUiEvent =
  | { type: "created"; transaction: Transaction }
  | { type: "updated"; transaction: Transaction }
  | { type: "deleted"; id: string; transaction?: Transaction };

const EVENT_NAME = "budget:transaction";

export function emitTransactionUiEvent(event: TransactionUiEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TransactionUiEvent>(EVENT_NAME, { detail: event }));
}

export function useTransactionUiEvents(handler: (event: TransactionUiEvent) => void) {
  const handlerRef = React.useRef(handler);
  React.useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  React.useEffect(() => {
    const onEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<TransactionUiEvent>).detail;
      if (!detail) return;
      handlerRef.current(detail);
    };
    window.addEventListener(EVENT_NAME, onEvent as EventListener);
    return () => window.removeEventListener(EVENT_NAME, onEvent as EventListener);
  }, []);
}






