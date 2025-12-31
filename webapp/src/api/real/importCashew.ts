import { fetchForm } from "@/api/real/fetchForm";

export type ImportCashewRowError = {
  row: number;
  message: string;
};

export type ImportCashewResponse = {
  ok: true;
  filename: string;
  commit: boolean;
  skip_duplicates: boolean;
  preserve_extras: boolean;

  total_rows: number;
  parsed_rows: number;
  invalid_rows: number;

  categories_created: number;
  transactions_created: number;
  transactions_skipped: number;

  column_mapping: Record<string, string>;
  warnings: string[];
  errors: ImportCashewRowError[];
};

export async function importCashewCsv(
  file: File,
  opts: { commit: boolean; skipDuplicates?: boolean; preserveExtras?: boolean },
): Promise<ImportCashewResponse> {
  const fd = new FormData();
  fd.append("file", file, file.name);

  return fetchForm<ImportCashewResponse>("/api/import/cashew", {
    method: "POST",
    body: fd,
    query: {
      commit: opts.commit,
      skipDuplicates: opts.skipDuplicates ?? true,
      preserveExtras: opts.preserveExtras ?? false,
    },
  });
}





