alter table public.cashbox_entries
  drop constraint if exists cashbox_entries_entry_type_check;

alter table public.cashbox_entries
  add constraint cashbox_entries_entry_type_check
  check (
    entry_type in (
      'cash_order',
      'cash_charge',
      'cash_settlement',
      'manual_in',
      'manual_out',
      'misc_expense',
      'restock_cash_out',
      'advance_reimbursement'
    )
  );
