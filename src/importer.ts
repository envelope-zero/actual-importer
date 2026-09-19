import 'dotenv/config'
import {
  Account,
  Category,
  Envelope,
  Rule
} from './types.js'

import api from '@actual-app/api'

const data = require(process.env.DATA_FILE || '../data.json');

(async () => {
  await api.init({
    dataDir: 'data',
    serverURL: process.env.SERVER_URL || "",
    password: process.env.SERVER_PASSWORD || "",
  });

  const time = new Date()

  for (const budget of data.data.Budget) {
    const budgetId = budget.id

    // TODO: Remove time, this is only used for testing
    const budgetName = `${budget.name} - ${time.getHours()}:${time.getMinutes()}`
    await api.runImport(budgetName, () => run(budgetId, budgetName, data.data))
  }

  await api.shutdown();
})();

async function run(budgetId: string, budgetName: string, data: any) {
  const categoryGroups = await api.getCategoryGroups()
  const startingBalanceCategoryId = categoryGroups[0]?.categories?.filter(c => c.name == "Starting Balances")[0]?.id
  const incomeCategoryId = categoryGroups[0]?.categories?.filter(c => c.name == "Income")[0]?.id

  if (startingBalanceCategoryId === undefined || incomeCategoryId === undefined) {
    throw new Error("There is no Starting Balances category in the budget, or the income category is missing, this is impossible")
  }

  // EZ does not differ between accounts and payees, everything is an account
  const ezAccounts = data.Account.filter((a: Account) => a.BudgetID === budgetId)
  const accountsToCreate = ezAccounts.filter((a: Account) => a.External === false)
  const payeesToCreate = ezAccounts.filter((a: Account) => a.External === true)

  // Lookup map for payees. Key is the EZ account ID, value the Actual payee ID
  let payeeMap = new Map<string, string>()

  for (const payee of payeesToCreate) {
    const id = await api.createPayee({
      "name": payee.Name,
    })

    payeeMap.set(payee.id, id)

    if (payee.Note != "") {
      await api.updateNote(id, payee.Note)
    }

    const rules = data.MatchRule.filter((r: Rule) => r.AccountID === payee.id)
    for (const rule of rules) {
      await api.createRule({
        "stage": "default",
        "conditionsOp": "and",
        "conditions": [
          {
            "field": "imported_payee",
            "op": "matches",
            "value": rule.Match.replace("*", ".*")
          }
        ],
        "actions": [
          {
            "field": "payee",
            "op": "set",
            "value": id
          }
        ]
      })
    }
  }

  // Lookup map for accounts. Key is the EZ account ID, value is the Actual account ID
  let accountMap = new Map<string, string>()

  for (const account of accountsToCreate) {
    const id = await api.createAccount({
      "name": account.Name,
      "offbudget": !account.OnBudget,
    })

    accountMap.set(account.id, id)

    if (account.Note != "") {
      await api.updateNote(id, account.Note)
    }

    if (account.InitialBalance != "0") {
      await api.addTransactions(id, [
        {
          payee_name: "Starting Balance",

          // Use only the date, EZ uses an RFC3339 timestamp
          date: account.InitialBalanceDate.slice(0,10),

          // Remove the decimal dot, then convert to int
          amount: api.utils.amountToInteger(parseFloat(account.InitialBalance)),

          category: startingBalanceCategoryId
        }
      ])
    }

    // Get the transfer payee to import match rules to Actual rules, and for the payeeMap
    const payees = await api.getPayees()
    const transferPayee = payees.find(p => p.transfer_acct === id)

    if (transferPayee === undefined) {
      throw new Error("Transfer Payee is undefined, this is not possible")
    }

    // If we use this account as payee in a transfer, we need its transfer payee
    payeeMap.set(account.id, transferPayee.id)

    const rules = data.MatchRule.filter((r: Rule) => r.AccountID === account.id)
    for (const rule of rules) {
      await api.createRule({
        "stage": "default",
        "conditionsOp": "and",
        "conditions": [
          {
            "field": "imported_payee",
            "op": "matches",
            "value": rule.Match.replace("*", ".*")
          }
        ],
        "actions": [
          {
            "field": "payee",
            "op": "set",
            "value": transferPayee.id
          }
        ]
      })
    }
  }

  // Lookup map for categories: Key is the EZ envelope ID, value is the Actual category ID
  let categoryMap = new Map<string, string>()

  const categories = data.Category.filter((c: Category) => c.BudgetID === budgetId)
  for (const category of categories) {
    const id = await api.createCategoryGroup({
      "name": category.Name,
    })

    if (category.Note != "") {
      await api.updateNote(id, category.Note)
    }

    const envelopes = data.Envelope.filter((e: Envelope) => e.CategoryID === category.id)
    for (const envelope of envelopes) {
      const categoryId = await api.createCategory({
        "name": envelope.Name,
        "group_id": id,
      })

      categoryMap.set(envelope.id, categoryId)
    }
  }

  // Map for new transactions to create. Key is the Actual account ID, value is an array of Actual transactions
  let transactionsMap = new Map<string, Array<any>>()

  for (const [_, actualId] of accountMap) {
    transactionsMap.set(actualId, [])
  }

  for (const transaction of data.Transaction) {
    let actualAccountId = ""
    let actualTransaction : {
      date: string
      amount: number
      payee: string
      category: string | undefined
      notes: string | undefined
      cleared: boolean
    } = {
      "date": transaction.Date.slice(0,10),
      "amount":  0,
      "payee": "",
      "category": "",
      "notes": transaction.Note || null,
      "cleared": true
    }

    // Either the source or the destination has to be an account in the current budget. If both are, it's a transfer, which is also fine.
    //
    // If none of the two is in the account map, the transaction is for a different budget
    if (!accountMap.has(transaction.SourceAccountID) && !accountMap.has(transaction.DestinationAccountID)) {
      continue

      // This is a transfer, the distinction between account and payee is irrelevant. We use the source as account and the destination as payee
    } else if (accountMap.has(transaction.SourceAccountID) && accountMap.has(transaction.DestinationAccountID)) {
      actualAccountId = accountMap.get(transaction.SourceAccountID)!

      const payee = payeeMap.get(transaction.DestinationAccountID)
      if (payee === undefined) {
        throw new Error("Payee for transaction is undefined, this should not happen")
      }

      actualTransaction.payee = payee
      actualTransaction.amount = -api.utils.amountToInteger(parseFloat(transaction.Amount))

      // Transfers can be for e.g. Investement
      actualTransaction.category = categoryMap.get(transaction.EnvelopeID)

      // This is a regular transaction where the source is an account and the destination a payee
    } else if (accountMap.has(transaction.SourceAccountID) && !accountMap.has(transaction.DestinationAccountID)) {
      actualAccountId = accountMap.get(transaction.SourceAccountID)!

      const payee = payeeMap.get(transaction.DestinationAccountID)
      if (payee === undefined) {
        throw new Error("Payee for transaction is undefined, this should not happen")
      }

      actualTransaction.payee = payee
      actualTransaction.category = categoryMap.get(transaction.EnvelopeID)
      actualTransaction.amount = -api.utils.amountToInteger(parseFloat(transaction.Amount))

      // This is a regular transaction where the source is a payee and the destination is an account
    } else if (!accountMap.has(transaction.SourceAccountID) && accountMap.has(transaction.DestinationAccountID)){
      actualAccountId = accountMap.get(transaction.DestinationAccountID)!

      const payee = payeeMap.get(transaction.SourceAccountID)
      if (payee === undefined) {
        throw new Error("Payee for transaction is undefined, this should not happen")
      }
      actualTransaction.payee = payee
      actualTransaction.amount = api.utils.amountToInteger(parseFloat(transaction.Amount))

      let category = categoryMap.get(transaction.EnvelopeID)
      if (category === undefined) {
        category = incomeCategoryId
      }

      actualTransaction.category = category

    } else {
      throw new Error("A transaction not including an account has appeared, this should not happen")
    }

    // Push the finished transaction
    transactionsMap.get(actualAccountId)!.push(actualTransaction)
  }

  // Create the transactions in actual
  for (const [accountId, transactions] of transactionsMap) {
    await api.addTransactions(accountId, transactions, {runTransfers: true})
  }

  // Close accounts that are archived in EZ and have a balance of 0
  const accounts = await api.getAccounts()
  for (const account of accounts) {

    // Find the EZ account ID for this account
    let ezAccount : Account | undefined
    for (const [ezAccountId, actualAccountId] of accountMap) {
      if (actualAccountId === account.id) {
        ezAccount = data.Account.find((a: Account) => a.id === ezAccountId)
        break
      }
    }

    if (ezAccount === undefined) {
      throw new Error("EZ account for Actual account not found, this is impossible")
    }

    // If the account is not archived, nothing to do
    if (ezAccount.Archived == false) {
      continue
    }

    const balance = await api.getAccountBalance(account.id)
    if (balance === 0) {
      await api.closeAccount(account.id)
    } else {
      console.log(`Can't close account ${account.name} because of non-zero balance. You have to close it manually.`)
    }
  }

  for (const monthConfig of data.MonthConfig) {
    const categoryId = categoryMap.get(monthConfig.EnvelopeID)

    // This monthConfig is for another budget
    if (categoryId === undefined) {
      continue
    }

    await api.setBudgetAmount(monthConfig.Month.slice(0, 10), categoryId, api.utils.amountToInteger(parseFloat(monthConfig.Allocation)))
  }
}

