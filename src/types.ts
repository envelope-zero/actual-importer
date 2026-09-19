export type Account = {
  id: string
  BudgetID: string
  Name: string
  Note: string
  OnBudget: boolean
  External: boolean
  InitialBalance: string
  InitialBalanceDate: string
  Archived: boolean
}

export type Transaction = {
  SourceAccountID: string
  DestinationAccountID: string
  EnvelopeID: string
  Date: string
  Amount: string
  Note: string
  AvailableFrom: string
}

export type Category = {
  id: string
  BudgetID: string
  Name: string
  Note: string
  Archived: boolean
}

export type Envelope = {
  id: string
  CategoryID: string
  Name: string
  Note: string
}

export type Rule = {
  AccountID: string
  Match: string
}
